// Removes pre-launch test data: orders, the accounts that placed them, and the purchase counts
// those orders inflated.
//
// Usage:
//   node scripts/purge-test-data.mjs --env=prod                            report only (default)
//   node scripts/purge-test-data.mjs --env=prod --orders=all --reset-counts    still a report
//   node scripts/purge-test-data.mjs --env=prod --orders=all --reset-counts --execute --i-know-this-is-production
//   node scripts/purge-test-data.mjs --env=prod --orders=41,44,65 --execute ...   only those orders
//   node scripts/purge-test-data.mjs --env=prod --users=a@b.com,c@d.com --execute ...  accounts too
//   node scripts/purge-test-data.mjs --env=stage --rate-limits --execute       also the limiter rows
//
// Nothing is selected by pattern. An order is deleted because its id is listed (or `all` is
// passed), an account because its email is listed — guessing which "Наргиза" is a test and which
// is a customer is not something a script should do.
//
// Three couplings this exists to handle:
//
//   1. purchase_count does not follow the order. checkout increments it through
//      increment_product_purchase_counts, and deleting the order leaves the count behind — so
//      /popular and the homepage carousel would keep ranking by test purchases forever. With
//      --reset-counts the counts are recomputed from the orders that remain (zero for a full
//      purge, which correctly hides the section until a real order arrives).
//
//   2. Deleting an account takes its orders with it while orders.user_id is ON DELETE CASCADE.
//      That is why orders are deleted first here and the accounts after: the counts can be
//      recomputed from what is left, which is impossible once the rows are gone. See
//      supabase/migrations/20260911120600_orders_user_fk_set_null.sql — after it an account can be
//      deleted without erasing the sale.
//
//   3. backups/backup-db.mjs is the only copy of an order that exists anywhere; the old site has
//      the catalogue, but not this. The script refuses to run without a dump containing orders.
//
// An account with role=admin is never deleted — losing the last admin locks everyone out of
// /admin, and the recovery is a dashboard visit.

import { existsSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { resolveTarget } from "./lib/target.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const args = process.argv.slice(2);
const flag = (name) =>
  args
    .find((a) => a.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=") ?? null;
const target = resolveTarget({ destructive: true });
const EXECUTE = target.execute;
const RESET_COUNTS = args.includes("--reset-counts");
const CLEAR_RATE_LIMITS = args.includes("--rate-limits");
const ORDERS = flag("orders");
const USERS = (flag("users") ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const db = createClient(target.url, target.key, { auth: { persistSession: false } });

/** The most recent backups/<timestamp>/ that actually contains orders.json. */
function latestOrderBackup() {
  const dir = path.join(ROOT, "backups");
  if (!existsSync(dir)) return null;
  return readdirSync(dir)
    .filter((name) => existsSync(path.join(dir, name, "orders.json")))
    .sort()
    .pop();
}

const { data: orders, error: ordersError } = await db
  .from("orders")
  .select("id, user_id, customer_name, customer_phone, total, status, created_at")
  .order("id");
if (ordersError) {
  console.error("orders load failed:", ordersError.message);
  process.exit(1);
}

const { data: userList, error: usersError } = await db.auth.admin.listUsers({ perPage: 500 });
if (usersError) {
  console.error("users load failed:", usersError.message);
  process.exit(1);
}
const users = userList.users;

const orderIds =
  ORDERS === "all" ? orders.map((o) => o.id) : ORDERS ? ORDERS.split(",").map((n) => parseInt(n.trim(), 10)) : [];
const doomedOrders = orders.filter((o) => orderIds.includes(o.id));
const missing = orderIds.filter((id) => !orders.some((o) => o.id === id));

const doomedUsers = users.filter((u) => USERS.includes((u.email ?? "").toLowerCase()));
const unknownEmails = USERS.filter((e) => !users.some((u) => (u.email ?? "").toLowerCase() === e));
const admins = doomedUsers.filter((u) => u.app_metadata?.role === "admin");
const deletableUsers = doomedUsers.filter((u) => u.app_metadata?.role !== "admin");

console.log(`${orders.length} order(s), ${users.length} account(s) in the project\n`);

console.log(`ORDERS TO DELETE: ${doomedOrders.length}`);
for (const o of doomedOrders) {
  console.log(
    `  #${o.id}  ${o.created_at?.slice(0, 10)}  ${String(o.total).padStart(7)}  ${o.status.padEnd(10)}` +
      `  ${o.user_id ? "account" : "guest  "}  ${(o.customer_name ?? "").slice(0, 24)}  ${o.customer_phone ?? ""}`,
  );
}
if (missing.length > 0) console.log(`  (not found, ignored: ${missing.join(", ")})`);

console.log(`\nACCOUNTS TO DELETE: ${deletableUsers.length}`);
for (const u of deletableUsers) {
  const own = orders.filter((o) => o.user_id === u.id);
  const survivors = own.filter((o) => !orderIds.includes(o.id));
  console.log(`  ${u.email}  created=${u.created_at.slice(0, 10)}  orders=${own.length}`);
  // Worth spelling out: this is the ON DELETE CASCADE, and it is silent.
  if (survivors.length > 0) {
    console.log(`      ⚠ deleting this account also deletes order(s) ${survivors.map((o) => `#${o.id}`).join(", ")}`);
  }
  console.log("      cascades: profiles, cart_items, favorites");
}
for (const u of admins) console.log(`  ${u.email} — role=admin, SKIPPED`);
if (unknownEmails.length > 0) console.log(`  (no such account, ignored: ${unknownEmails.join(", ")})`);

if (RESET_COUNTS) {
  const { data: counted } = await db.from("products").select("id, name, purchase_count").gt("purchase_count", 0);
  const remaining = orders.filter((o) => !orderIds.includes(o.id));
  console.log(
    `\nPURCHASE COUNTS: ${counted?.length ?? 0} product(s) carry a count, recomputed from the ${remaining.length} order(s) that remain`,
  );
}

if (CLEAR_RATE_LIMITS) {
  const { count } = await db.from("rate_limits").select("*", { count: "exact", head: true });
  console.log(`\nRATE LIMITS: ${count} counter row(s) to clear`);
}

const backup = latestOrderBackup();
console.log(`\nBackup with orders.json: ${backup ?? "NONE"}`);

if (!EXECUTE) {
  console.log("\nDry run. Add --execute to apply.");
  process.exit(0);
}

if (!backup) {
  console.error("\nRefusing to delete: no backups/<timestamp>/orders.json exists.");
  console.error("Run `node backups/backup-db.mjs` first — an order exists nowhere else.");
  process.exit(1);
}

// Orders before accounts: the cascade would otherwise take rows the recompute below needs.
if (doomedOrders.length > 0) {
  const { error } = await db
    .from("orders")
    .delete()
    .in(
      "id",
      doomedOrders.map((o) => o.id),
    );
  if (error) {
    console.error("order delete failed:", error.message);
    process.exit(1);
  }
  console.log(`\nDeleted ${doomedOrders.length} order(s).`);
}

if (RESET_COUNTS) {
  const { data: remaining, error } = await db.from("orders").select("items");
  if (error) {
    console.error("order reload failed:", error.message);
    process.exit(1);
  }
  const totals = new Map();
  for (const order of remaining ?? []) {
    for (const item of Array.isArray(order.items) ? order.items : []) {
      if (typeof item?.id === "number") totals.set(item.id, (totals.get(item.id) ?? 0) + (item.quantity ?? 1));
    }
  }

  // Zero everything first, then write the surviving totals: a product whose only orders were
  // deleted has to come back to 0, and it is no longer in `totals` to be updated.
  const { error: zeroError } = await db.from("products").update({ purchase_count: 0 }).gt("purchase_count", 0);
  if (zeroError) {
    console.error("purchase_count reset failed:", zeroError.message);
    process.exit(1);
  }
  for (const [id, qty] of totals) {
    const { error: setError } = await db.from("products").update({ purchase_count: qty }).eq("id", id);
    if (setError) console.error(`  purchase_count for #${id} failed: ${setError.message}`);
  }
  console.log(`Recomputed purchase_count: ${totals.size} product(s) with a surviving order.`);
}

for (const u of deletableUsers) {
  const { error } = await db.auth.admin.deleteUser(u.id);
  if (error) console.error(`  account ${u.email} failed: ${error.message}`);
  else console.log(`Deleted account ${u.email}.`);
}

if (CLEAR_RATE_LIMITS) {
  const { error } = await db.from("rate_limits").delete().neq("bucket", "");
  if (error) console.error("rate_limits clear failed:", error.message);
  else console.log("Cleared rate_limits.");
}

console.log("\nDone. Re-run without --execute to confirm the result.");
