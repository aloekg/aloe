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
//   node scripts/seed-staging.mjs --env=stage --refresh            dry run of an in-place refresh
//   node scripts/seed-staging.mjs --env=stage --refresh --execute
//
// --refresh brings the catalogue of a staging database that is already in use up to date, without
// recreating it: the test accounts, orders and reviews stay, and catalogue rows production no longer
// has are deleted rather than left behind (a plain seed only upserts). purchase_count and the rating
// columns are kept as staging has them, because they are derived from staging's own orders and
// reviews — production's numbers would describe orders that are not there.
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
const REFRESH = process.argv.includes("--refresh");

// Belt and braces. The ref check inside resolveTarget is the real guard; this one survives someone
// "temporarily" editing PROD_REF or pointing .env.local somewhere new. A catalogue-only staging
// database has no orders and no profiles, so finding either means this is aimed at something real.
// --refresh exists for a staging that holds test orders, so there the ref check alone has to do.
for (const table of ["orders", "profiles"]) {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true });
  if (error) fail(`could not read ${table}: ${error.message}`);
  if (REFRESH) console.log(`${table}: ${count} row(s) on staging, kept`);
  else if (count > 0)
    fail(
      `${table} holds ${count} row(s). This does not look like staging. Refusing.\n` +
        "(To update the catalogue of a staging that is in use, pass --refresh.)",
    );
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

// ---------------------------------------------------------------------------
// What a refresh changes

async function stagingRows(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from(table)
      .select(columns)
      .order("id")
      .range(from, from + 999);
    if (error) fail(`could not read ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const plan = {};
if (REFRESH) {
  const current = {
    products: await stagingRows("products", "id"),
    brands: await stagingRows("brands", "id, slug"),
    categories: await stagingRows("categories", "id, slug, parent_id"),
    banners: await stagingRows("banners", "id"),
  };
  const dumped = { products, brands, categories, banners };
  for (const [table, rows] of Object.entries(current)) {
    const keep = new Set(dumped[table].map((r) => r.id));
    const have = new Set(rows.map((r) => r.id));
    const stale = rows.filter((r) => !keep.has(r.id));
    // A stale row holding a slug the dump reuses under another id would fail the upsert on the
    // unique slug, so it is renamed out of the way first and deleted with the rest afterwards.
    const slugs = new Map(dumped[table].map((r) => [r.slug, r.id]));
    const blocking = stale.filter((r) => r.slug != null && slugs.has(r.slug));
    plan[table] = { stale, blocking, added: dumped[table].filter((r) => !have.has(r.id)).length };
    console.log(
      `${table}: ${dumped[table].length} in the dump · ${plan[table].added} new · ` +
        `${dumped[table].length - plan[table].added} updated · ${stale.length} to delete` +
        (blocking.length ? ` (${blocking.length} holding a slug the dump reuses)` : ""),
    );
  }
  // Children before parents: categories.parent_id is ON DELETE RESTRICT.
  const parentOf = new Map(current.categories.map((c) => [c.id, c.parent_id]));
  const depth = (id) => (parentOf.get(id) == null ? 0 : 1 + depth(parentOf.get(id)));
  plan.categories.stale.sort((a, b) => depth(b.id) - depth(a.id));
}

if (!target.execute) {
  console.log("\ndry run — nothing written. Re-run with --execute.");
  process.exit(0);
}

async function removeIds(table, ids) {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await db
      .from(table)
      .delete()
      .in("id", ids.slice(i, i + 200));
    if (error) fail(`could not delete stale ${table}: ${error.message}`);
  }
  if (ids.length) console.log(`${table}: ${ids.length} stale rows deleted`);
}

// Products go first: a stale one may hold an external_id the dump gives to another id, and nothing
// in the dump points at it. Their reviews, favorites and cart rows cascade with them.
if (REFRESH) {
  await removeIds(
    "products",
    plan.products.stale.map((r) => r.id),
  );
  for (const table of ["brands", "categories"])
    for (const row of plan[table].blocking) {
      const { error } = await db
        .from(table)
        .update({ slug: `${row.slug}-stale-${row.id}` })
        .eq("id", row.id);
      if (error) fail(`could not move ${table} ${row.id} off its slug: ${error.message}`);
    }
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
const KEEP_ON_STAGING = ["purchase_count", "rating_sum", "rating_count"];
await load(
  "products",
  REFRESH
    ? products.map((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !KEEP_ON_STAGING.includes(k))))
    : products,
);

if (REFRESH) {
  for (const table of ["categories", "brands", "banners"])
    await removeIds(
      table,
      plan[table].stale.map((r) => r.id),
    );
}

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
