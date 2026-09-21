// Copies every storage object from one Supabase project's buckets into another's.
//
// This exists because the official region-migration path does not cover storage. `supabase db dump
// --data-only` carries the *rows* of storage.buckets and storage.objects across, and those rows
// describe files that only exist in the old project's S3 bucket — restore them alone and every
// product photo 404s while the database insists they are there. So the files move first, through
// this script, and the restore excludes both storage tables:
// the rows in the new project are then the ones these uploads created, which is the only version
// of them that is true.
//
// Usage:
//   node scripts/migrate-storage.mjs --from=prod --to=new              list what would be copied
//   node scripts/migrate-storage.mjs --from=prod --to=new --execute    copy
//
// Safe to re-run, and meant to be: an object already present at the same path with the same byte
// count is skipped, so an interrupted run is resumed by running it again rather than started over.
// Pass --overwrite to re-upload regardless — that is for a source file that changed, which during a
// migration should be nothing.
//
// It never deletes. The failure mode this guards against is the one prune-orphan-images.mjs warns
// about at length, approached from the other side: a copy is additive, so the worst a wrong --to
// does is leave files somewhere they are not wanted.

import { createClient } from "@supabase/supabase-js";
import { PROD_REF, resolveEndpoint } from "./lib/target.mjs";

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

const EXECUTE = process.argv.includes("--execute");
const OVERWRITE = process.argv.includes("--overwrite");
const CONCURRENCY = Number(arg("concurrency") ?? 8);
const ONLY_BUCKET = arg("bucket");

const from = resolveEndpoint(arg("from"), { flag: "--from" });
const to = resolveEndpoint(arg("to"), { flag: "--to" });

if (from.ref === to.ref) die(`--from and --to both name ${from.ref}. A copy has to end somewhere else.`);
// Writing *into* production is how this script is used after the region move (production becomes
// the new project), so this is a confirmation, not a prohibition.
if (to.isProd && EXECUTE && !process.argv.includes("--i-know-this-is-production")) {
  die(`--to=${to.name} is PRODUCTION (${to.ref}). Add --i-know-this-is-production if that is the intent.`);
}

console.error(`→ ${from.name} (${from.ref})  →  ${to.name} (${to.ref})   ${EXECUTE ? "EXECUTE" : "dry run"}`);

const source = createClient(from.url, from.key);
const dest = createClient(to.url, to.key);

/** Every object under `prefix`, recursively. Folders come back from list() with a null id. */
async function walk(client, bucket, prefix = "") {
  const files = [];
  const folders = [];
  for (let offset = 0; ; ) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data.length) break;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null || entry.metadata?.size == null) folders.push(path);
      else files.push({ path, size: entry.metadata.size, mimetype: entry.metadata.mimetype, meta: entry.metadata });
    }
    offset += data.length;
    if (data.length < 1000) break;
  }
  for (const folder of folders) files.push(...(await walk(client, bucket, folder)));
  return files;
}

const { data: sourceBuckets, error: bucketsError } = await source.storage.listBuckets();
if (bucketsError) die(`listing buckets on ${from.ref}: ${bucketsError.message}`);
const buckets = sourceBuckets.filter((b) => !ONLY_BUCKET || b.name === ONLY_BUCKET);
if (!buckets.length) die(`no buckets to copy${ONLY_BUCKET ? ` (--bucket=${ONLY_BUCKET} matched nothing)` : ""}.`);

const { data: destBuckets, error: destBucketsError } = await dest.storage.listBuckets();
if (destBucketsError) die(`listing buckets on ${to.ref}: ${destBucketsError.message}`);
const destByName = new Map(destBuckets.map((b) => [b.name, b]));

let copied = 0;
let skipped = 0;
const failures = [];
const rejected = [];

for (const bucket of buckets) {
  // The bucket's own settings matter as much as its contents: file_size_limit and
  // allowed_mime_types are what an admin upload is checked against, and app/admin/actions.ts
  // applies its own, different limits on top (CODEBASE.md → Storage buckets). A bucket recreated
  // with the CLI defaults would be private and unlimited, which breaks reads and loosens writes at
  // the same time.
  const existing = destByName.get(bucket.name);
  const settings = {
    public: bucket.public,
    fileSizeLimit: bucket.file_size_limit,
    allowedMimeTypes: bucket.allowed_mime_types,
  };

  if (!existing) {
    console.log(
      `bucket ${bucket.name}: missing on ${to.ref} → create (public=${bucket.public}, limit=${bucket.file_size_limit})`,
    );
    if (EXECUTE) {
      const { error } = await dest.storage.createBucket(bucket.name, settings);
      if (error) die(`creating bucket ${bucket.name} on ${to.ref}: ${error.message}`);
    }
  } else {
    const drift = [
      existing.public !== bucket.public && `public ${existing.public} ≠ ${bucket.public}`,
      existing.file_size_limit !== bucket.file_size_limit &&
        `file_size_limit ${existing.file_size_limit} ≠ ${bucket.file_size_limit}`,
      JSON.stringify(existing.allowed_mime_types ?? null) !== JSON.stringify(bucket.allowed_mime_types ?? null) &&
        `allowed_mime_types ${JSON.stringify(existing.allowed_mime_types)} ≠ ${JSON.stringify(bucket.allowed_mime_types)}`,
    ].filter(Boolean);
    if (drift.length) {
      console.log(`bucket ${bucket.name}: settings differ → align (${drift.join("; ")})`);
      if (EXECUTE) {
        const { error } = await dest.storage.updateBucket(bucket.name, settings);
        if (error) die(`updating bucket ${bucket.name} on ${to.ref}: ${error.message}`);
      }
    }
  }

  const sourceFiles = await walk(source, bucket.name);
  const destFiles = existing ? await walk(dest, bucket.name) : [];
  const destBySize = new Map(destFiles.map((f) => [f.path, f.size]));

  const todo = [];
  let bucketSkipped = 0;
  for (const file of sourceFiles) {
    if (!OVERWRITE && destBySize.get(file.path) === file.size) {
      bucketSkipped++;
      continue;
    }
    // The destination enforces the same two checks the source did, so anything the source somehow
    // holds in violation of them would be refused here. Reported rather than retried: an upload
    // loop cannot fix a 3 MB file in a 2 MB bucket.
    if (bucket.file_size_limit != null && file.size > bucket.file_size_limit) {
      rejected.push(`${bucket.name}/${file.path}: ${file.size} B over the bucket's ${bucket.file_size_limit} B limit`);
      continue;
    }
    if (bucket.allowed_mime_types?.length && file.mimetype && !bucket.allowed_mime_types.includes(file.mimetype)) {
      rejected.push(
        `${bucket.name}/${file.path}: content-type ${file.mimetype} not in ${bucket.allowed_mime_types.join(", ")}`,
      );
      continue;
    }
    todo.push(file);
  }

  skipped += bucketSkipped;
  const bytes = todo.reduce((a, f) => a + f.size, 0);
  console.log(
    `bucket ${bucket.name}: ${sourceFiles.length} objects on ${from.ref}, ${destFiles.length} on ${to.ref} → ` +
      `${todo.length} to copy (${(bytes / 1048576).toFixed(1)} MB), ${bucketSkipped} already there`,
  );

  if (!EXECUTE || !todo.length) continue;

  let done = 0;
  const queue = todo.slice();
  const workers = Array.from({ length: Math.max(1, CONCURRENCY) }, async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      const ok = await copyOne(bucket.name, file);
      done += ok ? 1 : 0;
      if (ok) copied++;
      if (done % 250 === 0) console.log(`  ${bucket.name}: ${done}/${todo.length}`);
    }
  });
  await Promise.all(workers);
  console.log(`  ${bucket.name}: ${done}/${todo.length} copied`);
}

/** Download + upload with two retries. A single network blip should not cost the whole run. */
async function copyOne(bucket, file) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { data, error } = await source.storage.from(bucket).download(file.path);
      if (error) throw error;
      const { error: uploadError } = await dest.storage.from(bucket).upload(file.path, data, {
        contentType: file.mimetype || data.type || "application/octet-stream",
        // list() reports it as a header value ("max-age=3600"); upload() wants the seconds.
        cacheControl: String(/\d+/.exec(file.meta?.cacheControl ?? "")?.[0] ?? 3600),
        upsert: true,
      });
      if (uploadError) throw uploadError;
      return true;
    } catch (error) {
      if (attempt === 3) {
        failures.push(`${bucket}/${file.path}: ${error.message ?? error}`);
        return false;
      }
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  return false;
}

console.log("");
console.log(
  EXECUTE ? `copied ${copied}, skipped ${skipped}` : `dry run — nothing written. ${skipped} objects already in place.`,
);
if (rejected.length) {
  console.log(`\n${rejected.length} object(s) the destination bucket's own rules refuse:`);
  rejected.forEach((line) => console.log(`  ${line}`));
}
if (failures.length) {
  console.log(`\n${failures.length} failed after 3 attempts — re-run to pick them up:`);
  failures.slice(0, 40).forEach((line) => console.log(`  ${line}`));
  process.exit(1);
}
if (!EXECUTE) console.log(`\nAdd --execute to copy${to.ref === PROD_REF ? " (and --i-know-this-is-production)" : ""}.`);

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}
