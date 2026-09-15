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

for (const table of tables) {
  const { data, error, count } = await supabase.from(table).select("*", { count: "exact" });
  if (error) {
    console.error(`Failed to back up ${table}:`, error.message);
    process.exit(1);
  }
  writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(data, null, 2));
  console.log(`${table}: backed up ${data.length} rows (count=${count})`);
}

console.log(`\nBackup written to backups/${timestamp}/`);
