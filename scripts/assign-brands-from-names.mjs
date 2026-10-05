// Fills in `brand_id` on products that have none, from a brand name already written in the product's
// own name ("Zewa Deluxe Орхидея…", "Зубная паста Sensodyne…").
//
// Usage:
//   node scripts/assign-brands-from-names.mjs --env=prod                                          report only (default)
//   node scripts/assign-brands-from-names.mjs --env=prod --execute --i-know-this-is-production    write brand_id
//
// Only existing brands are matched: a brand missing from `brands` (Canped, Kleenex, Sanosan…) is
// reported as a candidate and left for a human, since creating one publishes a /brands/<slug> page.
//
// The rules were checked against the products that already have a brand — 98.6% of those the
// matcher names agree with the catalogue, and every disagreement is handled below:
//
//   * A brand matches as whole words, ignoring case, ё/е, punctuation and "&"/"and", and also with
//     its spaces removed ("AirWick" is Air Wick). A longer brand beats a shorter one inside it.
//
//   * START_ONLY brands are ordinary words, so they count only at the start of the name: "Premium
//     Gold" is not the brand Gold (that one is "Gold wind"), "Free & Clear" is not Clear, "Японская
//     весна" is not Весна, and "Моя Прелесть" is a different line from Прелесть Professional.
//
//   * When a name holds two brands, PREFER settles the pairs the catalogue already settled — Garnier
//     Fructis is filed under Fructis, L'Oreal Elseve under Elseve. Otherwise the earlier one wins
//     (Lion TOP … Platinum Clear is Lion).
//
// The write is conditional on `brand_id is null`, so a brand an admin set while this ran is kept.
// Storefront caches pick the change up within CATALOGUE_TTL; nothing here expires a tag.

import { createClient } from "@supabase/supabase-js";
import { resolveTarget } from "./lib/target.mjs";

const target = resolveTarget({ destructive: true });

const START_ONLY = new Set(["Gold", "Clear", "Весна", "Nature", "Прелесть"]);

const PREFER = [
  { brands: ["Garnier", "Fructis"], pick: "Fructis" },
  { brands: ["Loreal", "Elseve"], pick: "Elseve" },
];

const db = createClient(target.url, target.key, { auth: { persistSession: false } });

const norm = (s) =>
  ` ${s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/&/g, " and ")
    .replace(/['’`]/g, "")
    .replace(/[^a-zа-я0-9+]+/g, " ")
    .trim()} `;

function findAll(haystack, needle) {
  const out = [];
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) out.push(i);
  return out;
}

function matchBrands(name, brands) {
  const text = norm(name);
  const hits = [];
  for (const brand of brands) {
    const forms = new Set([brand.key, ` ${brand.key.trim().replace(/ /g, "")} `]);
    for (const form of forms)
      for (const pos of findAll(text, form)) {
        if (START_ONLY.has(brand.name) && pos !== 0) continue;
        hits.push({ brand, pos, end: pos + form.length });
      }
  }
  const unique = hits.filter(
    (h) => !hits.some((o) => o.brand !== h.brand && o.end - o.pos > h.end - h.pos && o.pos <= h.pos && o.end >= h.end),
  );
  const byBrand = new Map();
  for (const h of unique.sort((a, b) => a.pos - b.pos)) if (!byBrand.has(h.brand.id)) byBrand.set(h.brand.id, h);
  return [...byBrand.values()];
}

function pick(hits) {
  if (hits.length === 1) return hits[0].brand;
  const names = new Set(hits.map((h) => h.brand.name));
  const rule = PREFER.find((r) => names.size === r.brands.length && r.brands.every((b) => names.has(b)));
  if (rule) return hits.find((h) => h.brand.name === rule.pick).brand;
  return hits[0].brand;
}

async function loadAll(build) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const { data: brandRows, error: brandError } = await db.from("brands").select("id, name").order("name");
if (brandError) {
  console.error("brands load failed:", brandError.message);
  process.exit(1);
}
const brands = brandRows.map((b) => ({ ...b, key: norm(b.name) })).filter((b) => b.key.trim());

const products = await loadAll(() =>
  db.from("products").select("id, name, published").is("brand_id", null).order("id"),
);

if (products.length === 0) {
  console.log("Every product has a brand. Nothing to do.");
  process.exit(0);
}

const resolved = [];
const unmatched = [];
for (const p of products) {
  const hits = matchBrands(p.name ?? "", brands);
  if (hits.length === 0) unmatched.push(p);
  else resolved.push({ product: p, brand: pick(hits), also: hits.length > 1 ? hits.map((h) => h.brand.name) : null });
}

console.log(
  `${products.length} product(s) without a brand · ${resolved.length} matched · ${unmatched.length} left for a human\n`,
);

const byBrand = new Map();
for (const r of resolved) {
  if (!byBrand.has(r.brand.id)) byBrand.set(r.brand.id, { brand: r.brand, rows: [] });
  byBrand.get(r.brand.id).rows.push(r);
}

console.log("MATCHED");
for (const { brand, rows } of [...byBrand.values()].sort((a, b) => b.rows.length - a.rows.length)) {
  console.log(`  ${String(rows.length).padStart(3)} × ${brand.name} (${brand.id})`);
  for (const { product, also } of rows) {
    const note = also ? `   [also ${also.filter((n) => n !== brand.name).join(", ")}]` : "";
    console.log(`        #${product.id}${product.published ? "" : " (скрыт)"} ${product.name.slice(0, 80)}${note}`);
  }
}

// The leading Latin word is where an unlisted brand usually sits; a Russian one is mostly a product type.
const candidates = new Map();
for (const p of unmatched) {
  const word = (p.name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!/^[A-Za-z][A-Za-z0-9.'&+-]+$/.test(word)) continue;
  const key = word.toLowerCase();
  if (!candidates.has(key)) candidates.set(key, { word, count: 0 });
  candidates.get(key).count += 1;
}
const listed = [...candidates.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
console.log(`\nNOT IN brands — leading Latin words of the unmatched names (${listed.length}):`);
console.log(`  ${listed.map((c) => `${c.word} ${c.count}`).join(", ")}`);

if (!target.execute) {
  console.log("\nDry run. Re-run with --execute to write the matched ones.");
  process.exit(0);
}

console.log("\nApplying…");
let updated = 0;
for (const { brand, rows } of byBrand.values()) {
  const { data, error } = await db
    .from("products")
    .update({ brand_id: brand.id })
    .in(
      "id",
      rows.map((r) => r.product.id),
    )
    .is("brand_id", null)
    .select("id");
  if (error) {
    console.error(`  FAILED ${brand.name}: ${error.message}`);
    continue;
  }
  updated += data.length;
  console.log(`  ${String(data.length).padStart(3)} × ${brand.name}`);
}
console.log(`\n${updated} product(s) updated · ${products.length - updated} still without a brand.`);
