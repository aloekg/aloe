// Uploads a folder of category tiles and points each category at its picture, by file name = slug
// ("poroshki.jpeg" → the category whose slug is poroshki). For a batch made outside the admin, such
// as the subcategory tiles generated from prompts; one picture is quicker through the admin itself.
//
// Usage:
//   node scripts/upload-category-images.mjs --env=stage --dir=catalog                     report only
//   node scripts/upload-category-images.mjs --env=stage --dir=catalog --execute
//   node scripts/upload-category-images.mjs --env=prod  --dir=catalog --execute --i-know-this-is-production
//   … --replace   also overwrite categories that already have a picture (skipped by default)
//
// Encoded exactly as uploadCategoryImage() does — WebP, ≤800px, q80 — so a tile looks the same
// whichever way it arrived. Nothing is deleted: a replaced picture stays in the bucket for
// prune-orphan-images.mjs to judge. The categories tag is not expired from here, so the storefront
// shows the pictures within REFERENCE_TTL, or at once after any category is saved in the admin.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { resolveTarget } from "./lib/target.mjs";

const target = resolveTarget({ destructive: true });
const dir = process.argv.find((a) => a.startsWith("--dir="))?.slice(6);
if (!dir) {
  console.error("Pass --dir=<folder with <slug>.jpeg|png|webp files>.");
  process.exit(1);
}
const REPLACE = process.argv.includes("--replace");
const db = createClient(target.url, target.key, { auth: { persistSession: false } });

const files = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f));
const { data: categories, error } = await db.from("categories").select("id, name, slug, image_url");
if (error) {
  console.error("categories load failed:", error.message);
  process.exit(1);
}
const bySlug = new Map(categories.map((c) => [c.slug, c]));

const plan = [];
const unknown = [];
const kept = [];
for (const file of files.sort()) {
  const category = bySlug.get(path.parse(file).name);
  if (!category) unknown.push(file);
  else if (category.image_url && !REPLACE) kept.push(category);
  else plan.push({ file, category });
}

console.log(
  `${files.length} file(s) · ${plan.length} to upload · ${kept.length} already have a picture · ${unknown.length} unmatched`,
);
for (const { file, category } of plan)
  console.log(`  ${file} → ${category.name} (${category.id})${category.image_url ? " [replace]" : ""}`);
if (kept.length) console.log(`kept (pass --replace to overwrite): ${kept.map((c) => c.slug).join(", ")}`);
if (unknown.length) console.log(`no category with that slug: ${unknown.join(", ")}`);

if (!target.execute) {
  console.log("\nDry run. Re-run with --execute to upload.");
  process.exit(0);
}

let done = 0;
for (const { file, category } of plan) {
  const body = await sharp(readFileSync(path.join(dir, file)))
    .rotate()
    .resize(800, 800, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  const object = `${category.slug}-${Date.now()}.webp`;
  const { error: uploadError } = await db.storage
    .from("categories")
    .upload(object, body, { contentType: "image/webp", cacheControl: "2592000" });
  if (uploadError) {
    console.error(`  FAILED upload ${file}: ${uploadError.message}`);
    continue;
  }
  const url = db.storage.from("categories").getPublicUrl(object).data.publicUrl;
  const { error: updateError } = await db.from("categories").update({ image_url: url }).eq("id", category.id);
  if (updateError) {
    console.error(`  FAILED update ${category.slug}: ${updateError.message} (uploaded as ${object})`);
    continue;
  }
  done += 1;
  console.log(`  ${category.slug} ← ${object} (${Math.round(body.length / 1024)} KB)`);
}
console.log(`\n${done} of ${plan.length} categories now have their picture.`);
