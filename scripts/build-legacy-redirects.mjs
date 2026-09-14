/**
 * Generates lib/legacy-redirects.ts — the map from the previous site's URLs to this one's.
 *
 * Product URLs are NOT here: there are 2415 of them and they resolve at request time against
 * `products.product_url` (lib/legacy-redirect.ts). Everything else the old sitemap listed —
 * brands, categories and the static pages — has no such column to match on, so the mapping is
 * resolved once, here, by reading the old site and matching on the name it prints in its <h1>.
 *
 * Run:  node --env-file=.env.local scripts/build-legacy-redirects.mjs
 * The old sitemap is the source of which URLs exist; nothing is invented.
 */
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const OLD = "https://old.aloe.kg";
const SITEMAP = `${OLD}/index.php?option=com_xmap&view=xml&tmpl=component&id=1`;

/**
 * The old top level, matched by hand: these 11 are too few to guess at and too valuable to get
 * wrong. `null` means the reorganisation left no equivalent — "Бытовая химия" split into
 * Для стирки + Для уборки, and "Для детей"/"Для мужчин" were dissolved into the other trees —
 * so those land on the catalogue index as a 302 rather than claiming a permanent home.
 */
const TOP_LEVEL = {
  "/catalog/bytovaya-khimiya.html": null,
  "/catalog/dlya-detej.html": null,
  "/catalog/dlya-muzhchin.html": null,
  "/catalog/tovary-dlya-doma.html": "/catalog/dom",
  "/catalog/kosmetika-bishkek.html": "/catalog/kosmetika",
  "/catalog/podguzniki.html": "/catalog/podguzniki",
  "/catalog/gigiena-tovar-bishkek.html": "/catalog/gigiena",
  "/catalog/ukhod-za-telom.html": "/catalog/telo",
  "/catalog/ukhod-za-polost-yu-rta.html": "/catalog/rot",
  "/catalog/ukhod-za-volosami.html": "/catalog/volosy",
  "/catalog/horeca-bishkek.html": "/catalog/ofis",
};

/** The old navigation. Every one of these has an exact counterpart. */
const STATIC = {
  "/catalog.html": "/catalog",
  "/brendy.html": "/brands",
  "/oplata-i-dostavka.html": "/delivery",
  "/novinki-mylomoyushchikh-tovarov-v-bishkeke.html": "/new",
  "/aktsiya-mylomoyushchikh-tovarov-v-bishkeke.html": "/sale",
  // A landing page for Ariel/Tide/Persil — laundry powders, which is now one category.
  "/kupit-emiratovskie-poroshki-v-bishkeke-oae.html": "/catalog/stirka",
};

/**
 * Judgement calls, keyed by the old URL rather than the old name: the reorganisation renamed most
 * subcategories rather than moving them ("Средства для обезжиривания на кухне" → "Жироудалители"),
 * and two old categories share the name "Шампуни и гели для душа" under different parents, so the
 * name alone is not a key. Same pattern as OVERRIDES in scripts/fix-orphan-categories.mjs.
 */
const CATEGORY_OVERRIDES = {
  "/catalog/bytovaya-khimiya/category/view/10.html": "stiralnye-poroshki",
  "/catalog/bytovaya-khimiya/category/view/23.html": "moyka-posudy",
  "/catalog/bytovaya-khimiya/category/view/26.html": "moyka-okon",
  "/catalog/bytovaya-khimiya/category/view/27.html": "konditsionery-belyo",
  "/catalog/bytovaya-khimiya/category/view/45.html": "moyka-pola",
  "/catalog/bytovaya-khimiya/category/view/46.html": "obezzhirivanie",
  "/catalog/bytovaya-khimiya/category/view/47.html": "tualet-vanna",
  "/catalog/bytovaya-khimiya/category/view/95.html": "nakip",
  "/catalog/dlya-detej/category/view/19.html": "zubnaya-pasta",
  "/catalog/dlya-detej/category/view/28.html": "stiralnye-poroshki",
  "/catalog/dlya-detej/category/view/49.html": "zubshchetki-niti",
  "/catalog/dlya-detej/category/view/50.html": "mylo",
  "/catalog/dlya-detej/category/view/67.html": "shampuni",
  "/catalog/dlya-detej/category/view/70.html": "kremy-masla-prisypki",
  "/catalog/tovary-dlya-doma/category/view/83.html": "antimol-dihlofos",
  "/catalog/tovary-dlya-doma/category/view/99.html": "antistatik-antiseptiki",
  "/catalog/dlya-muzhchin/category/view/62.html": "shampuni",
  "/catalog/kosmetika-bishkek/category/view/54.html": "umyvalki-skraby",
  "/catalog/podguzniki/category/view/102.html": "podguzniki-vzroslye",
  "/catalog/podguzniki/category/view/103.html": "podguzniki-deti",
  "/catalog/gigiena-tovar-bishkek/category/view/14.html": "prokladki-tampony",
  "/catalog/gigiena-tovar-bishkek/category/view/68.html": "stanki-depilyatory",
  "/catalog/gigiena-tovar-bishkek/category/view/96.html": "mochalki-myldnitsy",
  "/catalog/gigiena-tovar-bishkek/category/view/98.html": "intimnaya-gigiena",
  "/catalog/ukhod-za-polost-yu-rta/category/view/38.html": "opolaskivatel-rot",
  "/catalog/ukhod-za-polost-yu-rta/category/view/48.html": "zubshchetki-niti",
  "/catalog/ukhod-za-volosami/category/view/13.html": "konditsionery-volosy",
};

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]/gi, "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function h1(path) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(OLD + path, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) return null;
      const m = (await res.text()).match(/<h1[^>]*>([^<]*)<\/h1>/);
      return m ? m[1].trim() : null;
    } catch {
      await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sitemap = await (await fetch(SITEMAP, { signal: AbortSignal.timeout(60000) })).text();
const paths = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, ""));

const [{ data: brands }, { data: categories }] = await Promise.all([
  db.from("brands").select("id, name, slug"),
  db.from("categories").select("id, name, slug, parent_id"),
]);

const brandByName = new Map(brands.map((b) => [norm(b.name), b]));
const catByName = new Map();
for (const c of categories) if (!catByName.has(norm(c.name))) catByName.set(norm(c.name), c);
const catById = new Map(categories.map((c) => [c.id, c]));
const catBySlug = new Map(categories.map((c) => [c.slug, c]));

for (const slug of Object.values(CATEGORY_OVERRIDES)) {
  if (!catBySlug.has(slug)) throw new Error(`CATEGORY_OVERRIDES points at a slug that no longer exists: ${slug}`);
}

/** A subcategory has no page of its own — it is a ?sub= anchor on its top-level parent. */
function categoryPath(c) {
  if (!c.parent_id) return `/catalog/${c.slug}`;
  let parent = catById.get(c.parent_id);
  // Sub-subcategories sit one level deeper again; walk up to the top.
  while (parent?.parent_id) parent = catById.get(parent.parent_id);
  return parent ? `/catalog/${parent.slug}?sub=${c.slug}` : "/catalog";
}

const permanent = { ...STATIC };
const fallback = {};
const unmatched = { categories: [], brands: [] };

for (const [from, to] of Object.entries(TOP_LEVEL)) {
  if (to) permanent[from] = to;
  else fallback[from] = "/catalog";
}

const subcats = paths.filter((p) => p.includes("/category/view/"));
const brandPaths = paths.filter((p) => p.includes("/manufacturer/view/"));
console.log(`подкатегорий: ${subcats.length}, брендов: ${brandPaths.length}`);

for (const [i, p] of subcats.entries()) {
  const override = CATEGORY_OVERRIDES[p];
  const name = override ? null : await h1(p);
  const hit = override ? catBySlug.get(override) : name ? catByName.get(norm(name)) : null;
  if (hit) permanent[p] = categoryPath(hit);
  else {
    // Fall back to whatever the old top-level segment maps to, not to a guess at the subcategory.
    const top = p.match(/^\/catalog\/([^/]+)\//)?.[1];
    fallback[p] = TOP_LEVEL[`/catalog/${top}.html`] ?? "/catalog";
    unmatched.categories.push(`${p} → "${name ?? "?"}"`);
  }
  if (i % 20 === 19) console.log(`  категории ${i + 1}/${subcats.length}`);
  await sleep(120);
}

for (const [i, p] of brandPaths.entries()) {
  const name = await h1(p);
  const hit = name ? brandByName.get(norm(name)) : null;
  if (hit) permanent[p] = `/brands/${hit.slug}`;
  else {
    fallback[p] = "/brands";
    unmatched.brands.push(`${p} → "${name ?? "?"}"`);
  }
  if (i % 50 === 49) console.log(`  бренды ${i + 1}/${brandPaths.length}`);
  await sleep(120);
}

const entries = (o) =>
  Object.keys(o)
    .sort()
    .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(o[k])},`)
    .join("\n");

writeFileSync(
  "lib/legacy-redirects.ts",
  `/**
 * Generated by scripts/build-legacy-redirects.mjs — do not edit by hand.
 *
 * The previous site's non-product URLs, as listed by its own sitemap, mapped onto this one's.
 * Product URLs are resolved at request time instead; see lib/legacy-redirect.ts.
 *
 * Old JoomShopping ids never change, so this is frozen history rather than live data — a static
 * map keeps the lookup in proxy.ts free of a database round trip.
 */

/** An exact counterpart exists: 301. */
export const LEGACY_PERMANENT: Readonly<Record<string, string>> = {
${entries(permanent)}
};

/** No counterpart survived the reorganisation — the nearest listing instead, as a 302. */
export const LEGACY_FALLBACK: Readonly<Record<string, string>> = {
${entries(fallback)}
};
`,
);

console.log(`\n301: ${Object.keys(permanent).length}   302: ${Object.keys(fallback).length}`);
console.log(`\nбез соответствия — категории (${unmatched.categories.length}):`);
for (const u of unmatched.categories) console.log("  " + u);
console.log(`\nбез соответствия — бренды (${unmatched.brands.length}):`);
for (const u of unmatched.brands.slice(0, 200)) console.log("  " + u);
