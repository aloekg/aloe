// Dumps every table to backups/<timestamp>/. Reads only.
//
// Usage:
//   node backups/backup-db.mjs --env=prod     the one that matters
//   node backups/backup-db.mjs --env=stage
//
// --env is required rather than defaulting to production, so "I took a backup" is never an
// assumption about which database it came from.

import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { resolveTarget } from "../scripts/lib/target.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const target = resolveTarget();
const supabase = createClient(target.url, target.key);

// The environment is part of the directory name because a staging dump and a production dump are
// otherwise indistinguishable, and scripts/seed-staging.mjs picks "the newest dump" to load. Seeding
// staging from a staging dump would be a no-op that looks exactly like success. Dumps predating this
// (bare timestamps) are all from production.
const timestamp = `${new Date().toISOString().replace(/[:.]/g, "-")}-${target.name}`;
const outDir = path.join(__dirname, timestamp);
mkdirSync(outDir, { recursive: true });

// Orders and profiles are the reason this list is not just the catalogue: they are the only
// tables here whose rows cannot be rebuilt from anywhere else — the old site has the catalogue,
// but a placed order exists nowhere but this database. profiles carries customer names, phones and
// addresses, so the dump is personal data; backups/ is git-ignored and stays local.
const tables = ["categories", "products", "brands", "banners", "orders", "profiles", "favorites", "cart_items"];

/**
 * PostgREST caps a response at max_rows = 1000 (supabase/config.toml), and a capped response is not
 * an error: it is 1000 rows plus an exact count saying there are more. Without this loop every dump
 * held the first 1000 of 3164 products and announced it in a line that reads like success —
 * `products: backed up 1000 rows (count=3164)`. Orders stayed under the cap, which is the only
 * reason the one table that exists nowhere else was never truncated.
 */
const PAGE = 1000;

for (const table of tables) {
  const rows = [];
  let total = null;

  // Ordered by id, because an unordered range is not a stable window: rows can repeat or be skipped
  // between requests.
  for (let from = 0; ; from += PAGE) {
    const { data, error, count } = await supabase
      .from(table)
      .select("*", { count: "exact" })
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`Failed to back up ${table}:`, error.message);
      process.exit(1);
    }
    total = count;
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  // A dump that is short by a row is worse than no dump, because it will be trusted. purge-test-data.mjs
  // refuses to delete an order without a dump containing orders.json, and that promise is only worth
  // anything if the file is complete.
  if (total !== null && rows.length !== total) {
    console.error(`Failed to back up ${table}: got ${rows.length} rows, the table reports ${total}.`);
    process.exit(1);
  }

  writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(rows, null, 2));
  console.log(`${table}: backed up ${rows.length} rows`);
}

console.log(`\nBackup written to backups/${timestamp}/`);
