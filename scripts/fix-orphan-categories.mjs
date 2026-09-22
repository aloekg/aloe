// Re-attaches products whose `category_id` was stripped to a category in the current tree.
//
// Usage:
//   node scripts/fix-orphan-categories.mjs --env=prod              report only (default)
//   node scripts/fix-orphan-categories.mjs --env=prod --execute    write category_id + category
//
// Where the orphans come from: `fk_products_category_id` used to be ON DELETE SET NULL, so
// deleting an in-use category silently cleared category_id on its products. The FK is RESTRICT as
// of supabase/migrations/20260911120500, and a published product now has to be categorised
// (CHECK products_published_has_category) — but the rows orphaned before that still need homes.
// They are all unpublished, so nothing on the storefront is waiting on this.
//
// What they still carry is `products.category`, the denormalised label from the old site. The
// category tree was reorganised and renamed wholesale during the migration, so those labels no
// longer match one-to-one:
//
//   * Normalised match — identical once case, ё/е and spacing around punctuation are ignored.
//     "Пакеты, фольга , пергамент" is the tree's "Пакеты, фольга, пергамент". Applied
//     automatically: the product's own label points at exactly one leaf category.
//
//   * OVERRIDES — a rename the normaliser cannot bridge, decided by reading the products. Listed
//     explicitly below, one entry per label, with the reasoning.
//
//   * Everything else is reported with candidates and left alone. Some labels have no successor in
//     the tree at all ("Женские прокладки, тампоны, вкладыши в бюстгальтер"), some point at a node
//     that has sub-subcategories ("Зубные щетки , нити"), where only a human can pick the leaf, and
//     six rows carry two or three labels concatenated by the old scraper. Guessing those would put
//     products in the wrong section of the catalogue, which is worse than leaving them unpublished.
//
// Only leaf categories are eligible, matching the product editor: a category with children is an
// organisational node, not somewhere a product may live (see app/admin/products/page.tsx).

import { createClient } from "@supabase/supabase-js";
import { resolveTarget } from "./lib/target.mjs";

const target = resolveTarget();
const EXECUTE = target.execute;

/**
 * Renames the normaliser cannot see through. Each is a judgement call backed by the product names
 * behind the label, so they are written down rather than inferred:
 *
 *   "Кондиционеры, ополаскиватели и маски" → the products are hair care (Elseve
 *   бальзам-ополаскиватель, маски для волос), not laundry. The tree has both
 *   "Кондиционеры и маски для волос" (leaf, 70) and "Кондиционеры для белья" (a node), and the
 *   normaliser would have no way to choose.
 */
const OVERRIDES = [{ label: "Кондиционеры, ополаскиватели и маски", categoryId: 70 }];

const db = createClient(target.url, target.key, { auth: { persistSession: false } });

/**
 * The old labels and the current tree differ in case, ё/е and punctuation only — "Молочки,
 * кремы,лосьоны, для рук и тела" against "Молочки, кремы, лосьоны для рук и тела" is the same name
 * with the commas moved. Punctuation is dropped rather than tidied, since where it sits carries no
 * meaning here; two categories that differ *only* in punctuation would be caught as ambiguous below
 * instead of being resolved to whichever came first.
 */
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[,.;:()"«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const words = (s) =>
  new Set(
    norm(s)
      .split(/[^a-zа-я0-9]+/)
      .filter((w) => w.length > 3),
  );

/** Token overlap, only to order the candidates a human is going to read. */
function similarity(a, b) {
  const [x, y] = [words(a), words(b)];
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared += 1;
  return shared / Math.max(x.size, y.size);
}

const { data: categories, error: catError } = await db.from("categories").select("id, name, parent_id");
if (catError) {
  console.error("categories load failed:", catError.message);
  process.exit(1);
}

const hasChildren = new Set(categories.map((c) => c.parent_id).filter((id) => id != null));
const byId = new Map(categories.map((c) => [c.id, c]));
const byNorm = new Map();
for (const c of categories) {
  const key = norm(c.name);
  // An ambiguous name must not be resolved automatically.
  byNorm.set(key, byNorm.has(key) ? null : c);
}

function crumbs(category) {
  const out = [];
  for (let c = category; c; c = c.parent_id == null ? null : byId.get(c.parent_id)) out.unshift(c.name);
  return out.join(" → ");
}

const { data: orphans, error: orphanError } = await db
  .from("products")
  .select("id, name, category, published")
  .is("category_id", null)
  .order("id");
if (orphanError) {
  console.error("products load failed:", orphanError.message);
  process.exit(1);
}

if (orphans.length === 0) {
  console.log("No products without a category. Nothing to do.");
  process.exit(0);
}

const groups = new Map();
for (const p of orphans) {
  const label = p.category ?? "(no label)";
  if (!groups.has(label)) groups.set(label, []);
  groups.get(label).push(p);
}

const resolved = [];
const unresolved = [];

for (const [label, products] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
  const override = OVERRIDES.find((o) => o.label === label);
  const target = override ? byId.get(override.categoryId) : (byNorm.get(norm(label)) ?? null);

  if (target && !hasChildren.has(target.id)) {
    resolved.push({ label, products, target, via: override ? "override" : "normalised name" });
  } else {
    // Nodes are included: the closest match to "Зубные щетки , нити" is a node, and what the
    // reader needs is its children, since only a leaf may hold products.
    const candidates = categories
      .map((category) => ({ category, score: similarity(label, category.name) }))
      .filter((c) => c.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    unresolved.push({ label, products, candidates });
  }
}

const totalResolved = resolved.reduce((n, r) => n + r.products.length, 0);
console.log(
  `${orphans.length} product(s) without a category · ${totalResolved} resolvable · ${orphans.length - totalResolved} need a decision\n`,
);

console.log("RESOLVABLE");
for (const { label, products, target, via } of resolved) {
  console.log(`  ${String(products.length).padStart(3)} × ${label}`);
  console.log(`        → ${target.id}  ${crumbs(target)}   [${via}]`);
}

console.log("\nNEEDS A DECISION");
for (const { label, products, candidates } of unresolved) {
  console.log(`  ${String(products.length).padStart(3)} × ${label}`);
  if (candidates.length === 0) {
    console.log("        no similar category in the tree");
  } else {
    console.log("        closest categories:");
    for (const { category, score } of candidates) {
      const node = hasChildren.has(category.id);
      console.log(
        `          ${category.id}  ${crumbs(category)}   (${(score * 100).toFixed(0)}%)${node ? " — node, pick a child:" : ""}`,
      );
      if (node) {
        for (const child of categories.filter((c) => c.parent_id === category.id)) {
          console.log(`            ${child.id}  ${child.name}`);
        }
      }
    }
  }
  for (const p of products.slice(0, 3)) console.log(`        · #${p.id} ${p.name.slice(0, 70)}`);
  if (products.length > 3) console.log(`        · … ${products.length - 3} more`);
  console.log(`        fix by adding to OVERRIDES: { label: ${JSON.stringify(label)}, categoryId: ? }`);
}

if (!EXECUTE) {
  console.log("\nDry run. Re-run with --execute to write the resolvable ones.");
  process.exit(0);
}

console.log("\nApplying…");
let updated = 0;
for (const { label, products, target } of resolved) {
  // `category` is rewritten too: it is the denormalised copy the admin list and the product page
  // fall back to, and leaving the stale label would keep this script finding the same rows.
  const { error } = await db
    .from("products")
    .update({ category_id: target.id, category: target.name })
    .in(
      "id",
      products.map((p) => p.id),
    );
  if (error) {
    console.error(`  FAILED ${label}: ${error.message}`);
    continue;
  }
  updated += products.length;
  console.log(`  ${String(products.length).padStart(3)} × ${label} → ${target.name}`);
}
console.log(`\n${updated} product(s) updated · ${orphans.length - updated} still without a category.`);
