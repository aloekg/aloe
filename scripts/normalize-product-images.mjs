// Makes sure every product's two image columns point at WebP derivatives of the right size,
// generating whichever one is missing from the file already in Supabase Storage.
//
//   image_url      <base>.webp        ≤1200px q82  — detail page + quick-view modal
//   thumbnail_url  thumb/<base>.webp  ≤500px  q76  — cards, cart rows, autocomplete, admin list
//
// scripts/joomla/reimage-products.mjs already produces both for everything the old aloe.kg store
// still has a photo for. This covers the rest: products uploaded through the new admin before
// `uploadProductImage` started emitting a pair, and anything that run had to skip.
//
// Rows whose columns are already WebP are left untouched — re-encoding them would only throw away
// quality a second time.
//
// Usage:
//   node scripts/normalize-product-images.mjs --env=prod             dry run
//   node scripts/normalize-product-images.mjs --env=prod --execute --i-know-this-is-production

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { resolveTarget } from "./lib/target.mjs";

const BUCKET = "product-images";
const FULL = { width: 1200, quality: 82 };
const THUMB = { width: 500, quality: 76 };

const target = resolveTarget({ destructive: true });
const EXECUTE = target.execute;
const supabase = createClient(target.url, target.key);
// Same project as the rows below, by construction rather than by convention.
const prefix = `${target.url}/storage/v1/object/public/${BUCKET}/`;

const rows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await supabase
    .from("products")
    .select("id,name,image_url,thumbnail_url")
    .order("id")
    .range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}

const isWebp = (url) => !!url && url.split("?")[0].toLowerCase().endsWith(".webp");
const todo = rows.filter((p) => p.image_url && !(isWebp(p.image_url) && isWebp(p.thumbnail_url)));

console.log(`${rows.length} products · ${todo.length} need work`);
console.log(`  full missing/not webp  : ${todo.filter((p) => !isWebp(p.image_url)).length}`);
console.log(`  thumb missing/not webp : ${todo.filter((p) => !isWebp(p.thumbnail_url)).length}\n`);

if (!todo.length) {
  console.log("Nothing to do — every product already has a WebP pair.");
  process.exit(0);
}

const encode = (buffer, { width, quality }) =>
  sharp(buffer)
    // Phone uploads carry EXIF orientation; bake it in before resizing.
    .rotate()
    .resize(width, width, { fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();

let ok = 0;
let failed = 0;
let saved = 0;

for (const p of todo) {
  if (!p.image_url.startsWith(prefix)) {
    console.log(`  x #${p.id} image is not in ${BUCKET}: ${p.image_url.slice(0, 70)}`);
    failed++;
    continue;
  }

  const sourcePath = decodeURIComponent(p.image_url.slice(prefix.length));
  const base = sourcePath.replace(/\.[^.]+$/, "");
  const needFull = !isWebp(p.image_url);
  const needThumb = !isWebp(p.thumbnail_url);

  if (!EXECUTE) {
    console.log(
      `  #${p.id} ${sourcePath} -> ${[needFull && `${base}.webp`, needThumb && `thumb/${base}.webp`].filter(Boolean).join(" + ")}`,
    );
    ok++;
    continue;
  }

  try {
    const { data: blob, error: dlError } = await supabase.storage.from(BUCKET).download(sourcePath);
    if (dlError) throw new Error(dlError.message);
    const input = Buffer.from(await blob.arrayBuffer());

    const fields = {};
    const parts = [];

    for (const [need, preset, storagePath, column] of [
      [needFull, FULL, `${base}.webp`, "image_url"],
      [needThumb, THUMB, `thumb/${base}.webp`, "thumbnail_url"],
    ]) {
      if (!need) continue;
      const body = await encode(input, preset);
      const { error: upError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, body, { contentType: "image/webp", cacheControl: "2592000", upsert: true });
      if (upError) throw new Error(upError.message);
      fields[column] = `${prefix}${storagePath}`;
      parts.push(`${column.replace("_url", "")} ${Math.round(body.length / 1024)} KB`);
      if (column === "image_url") saved += input.length - body.length;
    }

    const { error: dbError } = await supabase.from("products").update(fields).eq("id", p.id);
    if (dbError) throw new Error(dbError.message);

    console.log(
      `  ok #${p.id} ${Math.round(input.length / 1024)} KB source -> ${parts.join(" + ")}  ${p.name.slice(0, 40)}`,
    );
    ok++;
  } catch (err) {
    console.log(`  x #${p.id} ${err.message.slice(0, 100)}`);
    failed++;
  }
}

console.log(
  EXECUTE
    ? `\ndone - ${ok} products normalized, ${failed} failed; full images shrank by ${(saved / 1048576).toFixed(1)} MB total`
    : `\n${ok} would be processed, ${failed} unusable. Re-run with --execute.`,
);
