// Lists (and optionally deletes) objects in the `product-images` bucket that nothing references
// any more — chiefly the pre-WebP files superseded by the re-image run.
//
// "References" means: products.image_url, products.thumbnail_url, any bucket URL appearing in
// products.description or products.seo_text (images inserted into a Markdown description live
// under `inline/` and are pointed at by text alone), and orders.items[].image_url.
//
// Usage:
//   node scripts/prune-orphan-images.mjs --env=prod                      list only
//   node scripts/prune-orphan-images.mjs --env=prod --execute --i-know-this-is-production
//   node scripts/prune-orphan-images.mjs --env=prod --execute --originals --i-know-this-is-production
//
// Held back unless --originals is passed: files named `<epoch-ms>-<rand>.<ext>`, i.e. what an admin
// uploaded through the product editor. Normalizing a product to a WebP pair leaves its original
// unreferenced, but that original is the best source there is for re-encoding it later — the
// WebP derivative is not. Everything else orphaned here is a superseded derivative.
//
// Deletion is irreversible and storage is not covered by backups/backup-db.mjs, so the dry run is
// the default — and --env is mandatory. This script subtracts what `products` references from what
// the bucket holds, so a database and a bucket belonging to different projects make every object
// look orphaned: run it with staging's rows against production's bucket and it deletes the entire
// catalogue's photography. resolveTarget() loads both from one file to make that unrepresentable.

import { createClient } from "@supabase/supabase-js";
import { resolveTarget } from "./lib/target.mjs";

const INCLUDE_ORIGINALS = process.argv.includes("--originals");

/** `uploadProductImage()` names its uploads `${Date.now()}-${rand}.${ext}`. */
const ADMIN_UPLOAD = /^\d{13}-[a-z0-9]+\.[a-z]+$/i;
const BUCKET = "product-images";

const target = resolveTarget({ destructive: true });
const EXECUTE = target.execute;
const supabase = createClient(target.url, target.key);
// Built from the same URL the client opened, so the rows and the bucket provably name one project.
const prefix = `${target.url}/storage/v1/object/public/${BUCKET}/`;

// Every path any product currently points at — from its two columns, and from its free text.
//
// The text matters as much as the columns. An image placed in a Markdown description
// (uploadDescriptionImage in app/admin/actions.ts, stored under `inline/`) is referenced by
// nothing but the description itself, so a version of this script that reads only image_url and
// thumbnail_url would class every one of them as an orphan and delete it on the next --execute.
const inBucket = new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\s)"'<]+`, "g");
const referenced = new Set();
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase
    .from("products")
    .select("image_url,thumbnail_url,description,seo_text")
    .order("id")
    .range(from, from + 999);
  if (error) throw error;
  for (const row of data) {
    for (const url of [row.image_url, row.thumbnail_url]) {
      if (url?.startsWith(prefix)) referenced.add(decodeURIComponent(url.slice(prefix.length)));
    }
    for (const text of [row.description, row.seo_text]) {
      if (typeof text !== "string") continue;
      for (const url of text.match(inBucket) ?? []) referenced.add(decodeURIComponent(url.slice(prefix.length)));
    }
  }
  if (data.length < 1000) break;
}

// `orders.items` freezes an image URL per line item. Those files must survive, or order history
// and past invoices lose their pictures.
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase
    .from("orders")
    .select("items")
    .order("id")
    .range(from, from + 999);
  if (error) throw error;
  for (const order of data) {
    for (const item of Array.isArray(order.items) ? order.items : []) {
      const url = item?.image_url;
      if (typeof url === "string" && url.startsWith(prefix))
        referenced.add(decodeURIComponent(url.slice(prefix.length)));
    }
  }
  if (data.length < 1000) break;
}

console.log(`referenced by product columns + descriptions + order history: ${referenced.size} objects`);

const orphans = [];
const protectedOriginals = [];
let kept = 0;
for (const folder of ["", "thumb"]) {
  for (let offset = 0; ; ) {
    const { data, error } = await supabase.storage.from(BUCKET).list(folder, { limit: 1000, offset });
    if (error) throw error;
    if (!data.length) break;
    for (const file of data) {
      // `list("")` also returns the `thumb` folder itself, which has no metadata.
      if (file.metadata?.size == null) continue;
      const key = folder ? `${folder}/${file.name}` : file.name;
      if (referenced.has(key)) kept++;
      else if (!INCLUDE_ORIGINALS && ADMIN_UPLOAD.test(file.name))
        protectedOriginals.push({ key, size: file.metadata.size });
      else orphans.push({ key, size: file.metadata.size });
    }
    offset += data.length;
    if (data.length < 1000) break;
  }
}

const bytes = orphans.reduce((a, o) => a + o.size, 0);
console.log(`in the bucket: ${kept} referenced, ${orphans.length} deletable (${(bytes / 1048576).toFixed(1)} MB)`);

if (protectedOriginals.length) {
  const held = protectedOriginals.reduce((a, o) => a + o.size, 0);
  console.log(
    `held back: ${protectedOriginals.length} admin-uploaded originals (${(held / 1048576).toFixed(1)} MB) — pass --originals to delete these too`,
  );
  protectedOriginals.forEach((o) => console.log(`  keep ${o.key}  ${(o.size / 1024).toFixed(0)} KB`));
}
console.log("");

const byExt = {};
for (const o of orphans) {
  const ext = o.key.split(".").pop().toLowerCase();
  byExt[ext] = (byExt[ext] ?? 0) + 1;
}
console.log("orphans by extension:", byExt);
console.log("first 15:");
orphans.slice(0, 15).forEach((o) => console.log(`  ${o.key}  ${(o.size / 1024).toFixed(0)} KB`));

if (!EXECUTE) {
  console.log(`\nNothing deleted. Re-run with --execute to remove all ${orphans.length} objects.`);
  process.exit(0);
}

for (let i = 0; i < orphans.length; i += 100) {
  const batch = orphans.slice(i, i + 100).map((o) => o.key);
  const { error } = await supabase.storage.from(BUCKET).remove(batch);
  if (error) throw new Error(error.message);
  console.log(`  deleted ${Math.min(i + 100, orphans.length)}/${orphans.length}`);
}
console.log(`\nDeleted ${orphans.length} objects, freed ${(bytes / 1048576).toFixed(1)} MB.`);
