// Reorganizes categories: dissolves top-level "Для мужчин" (4), "Для женщин" (74),
// "Для детей" (2) into the functional category tree, using level-3 sub-subcategories
// (Мужские/Женские/Детские/Унисекс) where gender/age variety is real (shampoos, shower
// gel, deodorant, shaving). See conversation / CODEBASE.md for the target tree.
//
// Usage:
//   node scripts/migrate-categories.mjs --env=prod             (dry run — prints the plan)
//   node scripts/migrate-categories.mjs --env=prod --execute --i-know-this-is-production
//
// Always run `node backups/backup-db.mjs --env=prod` first.

import { createClient } from "@supabase/supabase-js";
import { resolveTarget } from "./lib/target.mjs";

const target = resolveTarget({ destructive: true });
const EXECUTE = target.execute;
const supabase = createClient(target.url, target.key);

// ---------------------------------------------------------------------------
// 1. New categories to insert. `parent_id` is a literal id, `parent_ref` points
//    at another entry's `key` (resolved after that entry is inserted).
// ---------------------------------------------------------------------------
const CATEGORY_INSERTS = [
  { key: "DEO", name: "Дезодоранты", slug: "dezodoranty", parent_id: 11, sort_order: 4 },
  { key: "SHAVE", name: "Бритьё и депиляция", slug: "britie-depilyatsiya", parent_id: 11, sort_order: 5 },

  { key: "SHAMP_WOMEN", name: "Женские", slug: "shampuni-zhenskie", parent_id: 73, sort_order: 0 },
  { key: "SHAMP_MEN", name: "Мужские", slug: "shampuni-muzhskie", parent_id: 73, sort_order: 1 },
  { key: "SHAMP_KIDS", name: "Детские", slug: "shampuni-detskie", parent_id: 73, sort_order: 2 },
  { key: "SHAMP_UNISEX", name: "Унисекс", slug: "shampuni-unisex", parent_id: 73, sort_order: 3 },

  { key: "GEL_WOMEN", name: "Женские", slug: "gel-dusha-zhenskie", parent_id: 65, sort_order: 0 },
  { key: "GEL_MEN", name: "Мужские", slug: "gel-dusha-muzhskie", parent_id: 65, sort_order: 1 },
  { key: "GEL_KIDS", name: "Детские", slug: "gel-dusha-detskie", parent_id: 65, sort_order: 2 },
  { key: "GEL_UNISEX", name: "Унисекс", slug: "gel-dusha-unisex", parent_id: 65, sort_order: 3 },

  { key: "DEO_UNISEX", name: "Унисекс", slug: "dezodoranty-unisex", parent_ref: "DEO", sort_order: 2 },
];

// ---------------------------------------------------------------------------
// 2. Existing categories to reparent/rename in place (repurposed instead of
//    recreated, so their existing product assignments carry over for free).
// ---------------------------------------------------------------------------
const CATEGORY_UPDATES = [
  { id: 1, name: "Для уборки" }, // typo fix, no reparent

  { id: 42, parent_id: 8, name: "Интимная гигиена", sort_order: 7 },
  { id: 43, parent_id: 8, name: "Женская гигиена", sort_order: 8 },

  { id: 27, parent_id: 47, name: "Детское", sort_order: 0 },
  { id: 25, parent_id: 62, name: "Детская", sort_order: 0 },
  { id: 26, parent_id: 63, name: "Детская", sort_order: 0 },
  { id: 28, parent_id: 11, name: "Детская косметика", sort_order: 6 },

  { id: 54, parent_ref: "DEO", name: "Мужские", sort_order: 0 },
  { id: 66, parent_ref: "DEO", name: "Женские", sort_order: 1, slug: "dezodoranty-zhenskie" }, // frees up "dezodoranty" for the new parent

  { id: 55, parent_ref: "SHAVE", name: "Средства для бритья", sort_order: 0 },
  { id: 56, parent_ref: "SHAVE", name: "Станки и кассеты для бритья", sort_order: 1 },
  { id: 44, parent_ref: "SHAVE", name: "Женская депиляция", sort_order: 2 },
];

// Leaf name used for products.category (denormalized text) when a product
// lands directly on an existing category id (not one of the fresh inserts).
const EXISTING_LEAF_NAME = {
  61: "Подгузники для детей",
  41: "Влажные салфетки",
  70: "Кондиционеры и маски для волос",
  72: "Лаки, пенки, гели, масла для волос",
  28: "Детская косметика",
};

// Products whose name doesn't cleanly classify by keyword, or that were
// simply miscategorized in the source data (checked by hand against the
// actual product names — see conversation).
const MANUAL_OVERRIDES = {
  9002: { target: 28 }, // Bubchen baby oil -> Детская косметика, not shampoo/gel
  10986: { target: "GEL_KIDS" }, // "Моя Прелесть" bath foam, filed under Мужчины by mistake
  10987: { target: "GEL_KIDS" },
  10988: { target: "GEL_KIDS" },
  11046: { target: 70 }, // L'Oréal kids conditioner, filed under Мужчины by mistake
  11302: { target: 72 }, // Iris kids detangling spray, filed under Мужчины by mistake
  9395: { target: "GEL_MEN" }, // English-only name, keyword regex misses "gel"
  9402: { target: "GEL_MEN" }, // same L'Oreal Men Expert shower-gel line
};

function classifyHairBody(name) {
  const n = name.toLowerCase();
  if (n.includes("шампун")) return "SHAMPOO";
  if (n.includes("гель") || n.includes("пен") || n.includes("молочк") || n.includes("купан") || n.includes("подмыван"))
    return "GEL";
  return null;
}

function classifyDiaperWipe(name) {
  return name.toLowerCase().includes("салфетк") ? "WIPES" : "DIAPER";
}

async function main() {
  const { data: categories, error: catErr } = await supabase.from("categories").select("*");
  if (catErr) throw catErr;
  const { data: products, error: prodErr } = await supabase.from("products").select("id, name, category_id, category");
  if (prodErr) throw prodErr;

  const byId = new Map(categories.map((c) => [c.id, c]));

  // --- Build product reassignment plan -------------------------------------
  const reassignments = []; // { productId, target (id or key), name }
  const unclassified = [];

  for (const p of products.filter((p) => p.category_id === 2)) {
    if (MANUAL_OVERRIDES[p.id]) {
      reassignments.push({ productId: p.id, target: MANUAL_OVERRIDES[p.id].target, name: p.name });
      continue;
    }
    const kind = classifyDiaperWipe(p.name);
    reassignments.push({ productId: p.id, target: kind === "WIPES" ? 41 : 61, name: p.name });
  }

  for (const catId of [29, 57]) {
    const suffix = catId === 29 ? "KIDS" : "MEN";
    for (const p of products.filter((p) => p.category_id === catId)) {
      if (MANUAL_OVERRIDES[p.id]) {
        reassignments.push({ productId: p.id, target: MANUAL_OVERRIDES[p.id].target, name: p.name });
        continue;
      }
      const kind = classifyHairBody(p.name);
      if (!kind) {
        unclassified.push(p);
        continue;
      }
      reassignments.push({
        productId: p.id,
        target: `${kind === "SHAMPOO" ? "SHAMP" : "GEL"}_${suffix}`,
        name: p.name,
      });
    }
  }

  if (unclassified.length) {
    console.error("ABORT: could not classify these products (add to MANUAL_OVERRIDES):");
    unclassified.forEach((p) => console.error(`  id=${p.id}  ${p.name}`));
    process.exit(1);
  }

  // --- Print plan ------------------------------------------------------------
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}\n`);
  console.log(`Inserting ${CATEGORY_INSERTS.length} new categories:`);
  for (const c of CATEGORY_INSERTS) {
    console.log(`  + "${c.name}" (slug=${c.slug}, parent=${c.parent_ref ?? c.parent_id})`);
  }
  console.log(`\nReparenting/renaming ${CATEGORY_UPDATES.length} existing categories:`);
  for (const u of CATEGORY_UPDATES) {
    const before = byId.get(u.id);
    console.log(
      `  ~ id=${u.id} "${before?.name}" -> name="${u.name ?? before?.name}" parent=${u.parent_ref ?? u.parent_id ?? before?.parent_id}`,
    );
  }

  const byTarget = new Map();
  for (const r of reassignments) {
    byTarget.set(r.target, (byTarget.get(r.target) ?? 0) + 1);
  }
  console.log(`\nReassigning ${reassignments.length} products across ${byTarget.size} target categories:`);
  for (const [target, count] of byTarget) {
    console.log(`  -> ${target}: ${count} products`);
  }

  console.log(`\nDeleting now-empty categories: 29, 57, 2, 4, 74`);

  if (!EXECUTE) {
    console.log("\n(dry run — nothing written. Re-run with --execute to apply.)");
    return;
  }

  // --- Execute ---------------------------------------------------------------
  const idByKey = {};

  // Free up any slugs that a planned insert wants to reuse (e.g. id=66 currently
  // holds slug "dezodoranty", which the new level-2 "Дезодоранты" category wants).
  for (const u of CATEGORY_UPDATES) {
    if (!u.slug) continue;
    const { error } = await supabase.from("categories").update({ slug: u.slug }).eq("id", u.id);
    if (error) throw new Error(`Slug pre-update for ${u.id} failed: ${error.message}`);
    console.log(`freed slug for id=${u.id} -> ${u.slug}`);
  }

  for (const c of CATEGORY_INSERTS) {
    const parent_id = c.parent_ref ? idByKey[c.parent_ref] : c.parent_id;
    if (!parent_id) throw new Error(`Unresolved parent_ref for ${c.key}`);
    const { data, error } = await supabase
      .from("categories")
      .insert({ name: c.name, slug: c.slug, parent_id, sort_order: c.sort_order })
      .select("id")
      .single();
    if (error) throw new Error(`Insert ${c.key} failed: ${error.message}`);
    idByKey[c.key] = data.id;
    console.log(`inserted ${c.key} -> id=${data.id}`);
  }

  const { error: typoErr } = await supabase.from("categories").update({ name: "Для уборки" }).eq("id", 1);
  if (typoErr) throw typoErr;

  for (const u of CATEGORY_UPDATES) {
    if (u.id === 1) continue; // handled above
    const parent_id = u.parent_ref ? idByKey[u.parent_ref] : u.parent_id;
    const update = { parent_id, name: u.name, sort_order: u.sort_order };
    if (u.slug) update.slug = u.slug;
    const { error } = await supabase.from("categories").update(update).eq("id", u.id);
    if (error) throw new Error(`Update category ${u.id} failed: ${error.message}`);
  }
  console.log(`reparented/renamed ${CATEGORY_UPDATES.length} categories`);

  function resolveTarget(target) {
    const id = typeof target === "number" ? target : idByKey[target];
    if (!id) throw new Error(`Unresolved target ${target}`);
    const name = EXISTING_LEAF_NAME[id] ?? CATEGORY_INSERTS.find((c) => idByKey[c.key] === id)?.name;
    if (!name) throw new Error(`No leaf name known for target ${target} (id=${id})`);
    return { id, name };
  }

  const grouped = new Map();
  for (const r of reassignments) {
    const key = JSON.stringify(r.target);
    if (!grouped.has(key)) grouped.set(key, { target: r.target, ids: [] });
    grouped.get(key).ids.push(r.productId);
  }
  for (const { target, ids } of grouped.values()) {
    const { id: category_id, name: category } = resolveTarget(target);
    const { error } = await supabase.from("products").update({ category_id, category }).in("id", ids);
    if (error) throw new Error(`Product reassignment to ${target} failed: ${error.message}`);
    console.log(`reassigned ${ids.length} products -> "${category}" (id=${category_id})`);
  }

  // --- Safety check before deleting -----------------------------------------
  const idsToDelete = [29, 57, 2, 4, 74];
  const { data: catRefs } = await supabase.from("categories").select("id, parent_id").in("parent_id", idsToDelete);
  const orphanCats = (catRefs ?? []).filter((c) => !idsToDelete.includes(c.id)); // exclude self-references within the deletion set (e.g. 29's parent is 2)
  const { count: orphanProducts } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .in("category_id", idsToDelete);
  if (orphanCats.length || orphanProducts) {
    throw new Error(
      `Refusing to delete: ${orphanCats.length} categories and ${orphanProducts} products still reference the old ids.`,
    );
  }

  const { error: delErr } = await supabase.from("categories").delete().in("id", idsToDelete);
  if (delErr) throw new Error(`Delete failed: ${delErr.message}`);
  console.log("deleted categories 29, 57, 2, 4, 74");

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
