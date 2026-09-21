// Side-by-side census of two Supabase projects: row counts, the highest id and the newest
// created_at per table, object counts per bucket, and the number of Auth users. Read-only.
//
// It answers the two questions the region migration turns on. Before the cutover: did the restore
// actually land everything? And after it: did anything get written to the old project between the
// data dump and the environment switch — an order placed in those few minutes lives in Mumbai and
// nowhere else, and `newest created_at` is how you see it.
//
// Usage:
//   node scripts/compare-projects.mjs --from=prod --to=new
//
// A mismatch in `rate_limits` is expected and means nothing — it is a fixed-window counter that
// both projects keep rewriting. Everything else should agree exactly.

import { createClient } from "@supabase/supabase-js";
import { resolveEndpoint } from "./lib/target.mjs";

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const from = resolveEndpoint(arg("from"), { flag: "--from" });
const to = resolveEndpoint(arg("to"), { flag: "--to" });

/** created_at is what tells a stale copy from a complete one, so it is read where it exists. */
const TABLES = [
  { name: "products", timestamps: ["created_at"] },
  { name: "categories", timestamps: [] },
  { name: "brands", timestamps: [] },
  { name: "banners", timestamps: [] },
  { name: "orders", timestamps: ["created_at"] },
  { name: "profiles", timestamps: ["updated_at"], idColumn: null },
  { name: "favorites", timestamps: ["created_at"] },
  { name: "cart_items", timestamps: ["created_at"] },
];

async function census(endpoint) {
  const db = createClient(endpoint.url, endpoint.key);
  const out = { tables: {}, buckets: {}, users: null };

  for (const table of TABLES) {
    const { count, error } = await db.from(table.name).select("*", { count: "exact", head: true });
    if (error) {
      out.tables[table.name] = { error: error.message };
      continue;
    }
    const row = { count };
    if (table.idColumn !== null) {
      const { data } = await db.from(table.name).select("id").order("id", { ascending: false }).limit(1);
      row.maxId = data?.[0]?.id ?? null;
    }
    for (const column of table.timestamps) {
      const { data } = await db.from(table.name).select(column).order(column, { ascending: false }).limit(1);
      row.newest = data?.[0]?.[column] ?? null;
    }
    out.tables[table.name] = row;
  }

  const { data: buckets } = await db.storage.listBuckets();
  for (const bucket of buckets ?? []) {
    out.buckets[bucket.name] = await countObjects(db, bucket.name);
  }

  // GoTrue has no count endpoint; one page with the total in the header is the cheapest ask, and
  // it is also the only way to see that auth.users came across at all.
  const response = await fetch(`${endpoint.url}/auth/v1/admin/users?per_page=1`, {
    headers: { apikey: endpoint.key, Authorization: `Bearer ${endpoint.key}` },
  });
  out.users = response.ok ? Number(response.headers.get("x-total-count") ?? NaN) : `HTTP ${response.status}`;
  return out;
}

async function countObjects(db, bucket, prefix = "") {
  let files = 0;
  const folders = [];
  for (let offset = 0; ; ) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const entry of data) {
      if (entry.id === null || entry.metadata?.size == null)
        folders.push(prefix ? `${prefix}/${entry.name}` : entry.name);
      else files++;
    }
    offset += data.length;
    if (data.length < 1000) break;
  }
  for (const folder of folders) files += await countObjects(db, bucket, folder);
  return files;
}

console.error(`→ ${from.name} (${from.ref})  vs  ${to.name} (${to.ref})`);
const [left, right] = await Promise.all([census(from), census(to)]);

const pad = (value, width) => String(value ?? "—").padEnd(width);
const mark = (a, b) => (JSON.stringify(a) === JSON.stringify(b) ? " " : " ←—");
let differences = 0;

console.log(`\n${pad("", 14)}${pad(from.ref, 26)}${pad(to.ref, 26)}`);
for (const { name } of TABLES) {
  const a = left.tables[name] ?? {};
  const b = right.tables[name] ?? {};
  // A missing table comes back as a null count rather than an error, and "null rows" reads like a
  // table that is there and empty — which during a restore is the one thing it must not be
  // confused with.
  const cell = (row) =>
    row.error
      ? `error: ${row.error}`
      : row.count == null
        ? "нет таблицы"
        : `${row.count} rows${row.maxId != null ? `, max id ${row.maxId}` : ""}`;
  const flag = mark(a.count, b.count);
  if (flag.trim()) differences++;
  console.log(`${pad(name, 14)}${pad(cell(a), 26)}${pad(cell(b), 26)}${flag}`);
  if (a.newest || b.newest) {
    console.log(`${pad("  newest", 14)}${pad(a.newest, 26)}${pad(b.newest, 26)}${mark(a.newest, b.newest)}`);
    if (mark(a.newest, b.newest).trim()) differences++;
  }
}

console.log("");
for (const bucket of new Set([...Object.keys(left.buckets), ...Object.keys(right.buckets)])) {
  const a = left.buckets[bucket];
  const b = right.buckets[bucket];
  const flag = mark(a, b);
  if (flag.trim()) differences++;
  console.log(
    `${pad(bucket, 14)}${pad(`${a ?? "no bucket"} objects`, 26)}${pad(`${b ?? "no bucket"} objects`, 26)}${flag}`,
  );
}
const usersFlag = mark(left.users, right.users);
if (usersFlag.trim()) differences++;
console.log(`${pad("auth.users", 14)}${pad(left.users, 26)}${pad(right.users, 26)}${usersFlag}`);

console.log(differences ? `\n${differences} difference(s) marked ←—` : "\nthe two projects agree on every count");
