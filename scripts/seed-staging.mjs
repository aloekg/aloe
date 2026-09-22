// Seeds a staging database with a copy of the production CATALOGUE — and nothing else.
//
// Reads a dump written by backups/backup-db.mjs and loads four of its eight files. The other four
// (orders, profiles, favorites, cart_items) are personal data and are never copied: a staging
// environment holding a real customer's name, phone and address is a production database with a
// different hostname on it.
//
// Ids are preserved deliberately. Storage objects are named <product-id>.webp, products.product_url
// feeds the legacy 301s (lib/legacy-redirect.ts), and category ids are written down in
// the migration that built the category tree. Reseeding with fresh ids would quietly break all three.
//
// Images are NOT copied. Rows keep their absolute production storage URLs and staging reads the
// photos out of production's public buckets — see CODEBASE.md → «Окружения». Nothing here can
// write to them, and new uploads on staging land in staging's own bucket.
//
// Usage:
//   node scripts/seed-staging.mjs --env=stage                      dry run: counts and ordering
//   node scripts/seed-staging.mjs --env=stage --execute            write
//   node scripts/seed-staging.mjs --env=stage --execute --dump=2026-09-15T09-00-00-000Z-prod
//
// There is no --env=prod. resolveTarget refuses it outright.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { resolveTarget } from "./lib/target.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKUPS = path.join(ROOT, "backups");

const target = resolveTarget({ allow: ["stage"] });
const db = createClient(target.url, target.key, { auth: { persistSession: false } });

// Belt and braces. The ref check inside resolveTarget is the real guard; this one survives someone
// "temporarily" editing PROD_REF or pointing .env.local somewhere new. A catalogue-only staging
// database has no orders and no profiles, so finding either means this is aimed at something real.
for (const table of ["orders", "profiles"]) {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) fail(`could not read ${table}: ${error.message}`);
  if (count > 0) fail(`${table} holds ${count} row(s). This does not look like staging. Refusing.`);
}

// ---------------------------------------------------------------------------
// Pick the dump

const named = process.argv.find((a) => a.startsWith("--dump="))?.slice(7);
// Only production dumps, by directory suffix. Seeding staging from a staging dump is a no-op that
// looks exactly like success, which is why backup-db.mjs stamps the environment into the name.
// Dumps predating that convention have bare timestamps; pass one with --dump= if you want it.
const dump =
  named ??
  readdirSync(BACKUPS)
    .filter((d) => /^\d{4}-.*-prod$/.test(d))
    .sort()
    .at(-1);
if (!dump) {
  fail(
    "no production dump in backups/. Run:  node backups/backup-db.mjs --env=prod\n" +
      "(Dumps from before the -prod suffix can be used explicitly: --dump=<directory>)",
  );
}
const dumpDir = path.join(BACKUPS, dump);
if (!existsSync(dumpDir)) fail(`backups/${dump}/ does not exist.`);

const read = (t) => {
  const file = path.join(dumpDir, `${t}.json`);
  if (!existsSync(file)) fail(`backups/${dump}/${t}.json is missing — that dump is incomplete.`);
  return JSON.parse(readFileSync(file, "utf8"));
};

const categories = read("categories");
const brands = read("brands");
const banners = read("banners");
const products = read("products");

console.log(
  `dump ${dump}: ${categories.length} categories, ${brands.length} brands, ` +
    `${banners.length} banners, ${products.length} products`,
);

// ---------------------------------------------------------------------------
// Order the categories parent-first

// categories.parent_id is self-referential and the FK is not deferrable, so a child inserted ahead
// of its parent is a hard error. This is the single reason a plain `pg_dump --data-only | psql` of
// this table is a gamble: pg_dump emits rows in physical order and the only way to suspend the
// check needs a superuser, which hosted Supabase does not give you.
const levels = [];
const placed = new Set();
let remaining = [...categories];
while (remaining.length) {
  const ready = remaining.filter((c) => c.parent_id === null || placed.has(c.parent_id));
  if (!ready.length) fail(`category cycle or missing parent among ids: ${remaining.map((c) => c.id).join(", ")}`);
  ready.forEach((c) => placed.add(c.id));
  levels.push(ready);
  remaining = remaining.filter((c) => !placed.has(c.id));
}
console.log(`categories resolve into ${levels.length} level(s): ${levels.map((l) => l.length).join(" → ")}`);

if (!target.execute) {
  console.log("\ndry run — nothing written. Re-run with --execute.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Load

// 500-row chunks: products.json runs to ~5 MB, mostly markdown descriptions, and one request
// carrying all of it is past what PostgREST will accept.
async function load(table, rows, label = table) {
  for (let i = 0; i < rows.length; i += 500) {
    const slice = rows.slice(i, i + 500);
    const { error } = await db.from(table).upsert(slice, { onConflict: "id" });
    if (error) fail(`${label} [${i}..${i + slice.length}): ${error.message}`);
  }
  console.log(`${label}: ${rows.length} rows`);
}

// Order is forced by the foreign keys: brands and categories before products
// (products.brand_id → brands, products.category_id → categories ON DELETE RESTRICT), categories
// level by level. banners reference nothing.
await load("brands", brands);
for (const [i, level] of levels.entries()) await load("categories", level, `categories level ${i}`);
await load("banners", banners);
await load("products", products);

// ---------------------------------------------------------------------------
// Sequences

// Writing explicit ids does not advance the owning sequence, so the next insert from the admin UI
// would collide on the primary key — and it looks completely fine until someone tries. supabase-js
// cannot run setval, so it is printed for the SQL Editor.
//
// `categories_new_id_seq` is not a typo: the table was rebuilt under that name once and the
// sequence kept it.
console.log(`
Done. Now paste this into the staging SQL Editor — without it the first insert from the admin
fails on a duplicate key:

  select setval('public.brands_id_seq',         (select max(id) from public.brands));
  select setval('public.categories_new_id_seq', (select max(id) from public.categories));
  select setval('public.banners_id_seq',        (select max(id) from public.banners));
  select setval('public.products_id_seq',       (select max(id) from public.products));
`);

function fail(message) {
  console.error(`\nseed-staging: ${message}\n`);
  process.exit(1);
}
