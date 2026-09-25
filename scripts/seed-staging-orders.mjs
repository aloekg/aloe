// Fills a STAGING database with made-up customers and orders, so the admin — the analytics
// dashboard above all — has something to show.
//
// seed-staging.mjs copies the catalogue and deliberately nothing personal, which leaves staging with
// no orders at all: /admin/analytics then reads "заказов нет" for every period, and /admin/orders is
// empty. Copying production's orders instead would put real names, phones and addresses into a
// second database. So this invents them — against the real staging catalogue, so product ids,
// names, prices and photos are the genuine article and only the people are fiction.
//
// What it writes:
//   - mock accounts in Supabase Auth (mock-NN@mock.aloe.kg, email already confirmed — no mail is
//     sent), a `profiles` row for each, and a few favorites each — so the dashboard's
//     "Избранное и продажи" card has a wishlist to compare sales against;
//   - orders spread over the last --days, some placed by those accounts and some by guests, with
//     repeat buyers, a guest who later signs up under the same phone, every delivery zone and
//     every status;
//   - purchase_count on the products sold, for the confirmed orders only, exactly as a status
//     change increments it, so /popular and the
//     homepage carousel have something to rank on staging too.
//
// Usage:
//   node scripts/seed-staging-orders.mjs --env=stage                          dry run: the plan
//   node scripts/seed-staging-orders.mjs --env=stage --execute                write
//   node scripts/seed-staging-orders.mjs --env=stage --reset --execute        replace previous mock data
//   node scripts/seed-staging-orders.mjs --env=stage --reset --orders=0 --users=0 --execute   remove it
//
//   --orders=150   how many orders (default 150)
//   --users=12     how many mock accounts (default 12)
//   --days=120     how far back the orders go (default 120)
//   --seed=1       the random seed — the same seed plans the same data, so a dry run shows exactly
//                  what --execute will write
//
// There is no --env=prod. resolveTarget refuses it outright: made-up orders in production would
// email nobody, but they would count as sales on the dashboard and rank /popular.
//
// Unlike purge-test-data.mjs, removal here IS by marker — an order whose comment starts with
// "[mock]", an account whose email ends in @mock.aloe.kg. That script works on production, where
// guessing which row is a test is not acceptable; this one only ever deletes what it wrote itself,
// on a database that holds no real customers.

import { randomInt, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { resolveTarget } from "./lib/target.mjs";

const target = resolveTarget({ allow: ["stage"] });
const db = createClient(target.url, target.key, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const intFlag = (name, fallback) => {
  const raw = args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) fail(`--${name} must be a non-negative integer, got "${raw}".`);
  return value;
};

const ORDER_COUNT = intFlag("orders", 150);
const USER_COUNT = intFlag("users", 12);
const DAYS = Math.max(1, intFlag("days", 120));
const SEED = intFlag("seed", 1);
const RESET = args.includes("--reset");

const MOCK_DOMAIN = "mock.aloe.kg";
const MOCK_COMMENT = "[mock]";

// ---------------------------------------------------------------------------
// The shop's rules, duplicated rather than imported: scripts are plain ESM with no TS step (see
// set-user-password.mjs). If lib/constants.ts changes its tariff, change it here too — a stale copy
// only makes the mock data slightly unrealistic, it cannot corrupt anything real.

const MIN_ORDER_TOTAL = 500;
const FREE_DELIVERY_THRESHOLD = 10000;
const DELIVERY = [
  { id: "center", cost: 200, freeOverThreshold: true, weight: 55 },
  { id: "residential", cost: 300, freeOverThreshold: false, weight: 25 },
  { id: "regions", cost: 0, freeOverThreshold: false, weight: 12 },
  { id: "urgent", cost: 0, freeOverThreshold: false, weight: 8 },
];

function deliveryCost(zone, goods) {
  if (zone.freeOverThreshold && goods >= FREE_DELIVERY_THRESHOLD) return 0;
  return zone.cost;
}

// ---------------------------------------------------------------------------
// Seeded randomness — mulberry32. Math.random would make every dry run describe different data from
// the one that --execute then writes.

let state = SEED >>> 0 || 1;
function rand() {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (list) => list[Math.floor(rand() * list.length)];
function weighted(list, weightOf = (x) => x.weight) {
  const total = list.reduce((sum, x) => sum + weightOf(x), 0);
  let roll = rand() * total;
  for (const x of list) {
    roll -= weightOf(x);
    if (roll < 0) return x;
  }
  return list.at(-1);
}

// ---------------------------------------------------------------------------
// People

// Split by gender so surnames agree — "Айгерим Садыков" would read as a typo in every order card.
const WOMEN = [
  "Айгерим",
  "Нургуль",
  "Элмира",
  "Динара",
  "Айдана",
  "Мээрим",
  "Жылдыз",
  "Светлана",
  "Ольга",
  "Наталья",
  "Алина",
  "Гульнара",
  "Каныкей",
  "Ирина",
  "Асель",
  "Чолпон",
];
const MEN = ["Азамат", "Бекзат", "Тимур", "Эрлан", "Руслан", "Максат", "Улан", "Бакыт"];
const SURNAMES = [
  "Асанов",
  "Токтогулов",
  "Садыков",
  "Мамбетов",
  "Иманалиев",
  "Осмонов",
  "Кадыров",
  "Абдыкадыров",
  "Жумабаев",
  "Исаков",
  "Петров",
  "Турдубаев",
  "Алиев",
  "Сыдыков",
];

const STREETS = [
  "ул. Киевская",
  "пр. Чуй",
  "ул. Токтогула",
  "ул. Ахунбаева",
  "пр. Манаса",
  "ул. Боконбаева",
  "мкр Джал-29",
  "мкр Восток-5",
  "мкр Асанбай",
  "ул. Байтик Баатыра",
  "ж/м Ак-Орго",
  "ж/м Арча-Бешик",
];
const TOWNS = ["Ош", "Каракол", "Токмок", "Кант", "Балыкчы", "Нарын"];

/**
 * Two spellings on purpose: checkout stores the phone as typed, and the dashboard's customerKey()
 * has to recognise "+996 555 123 456" and "0555123456" as one person. Mock data that only ever
 * used one format would never exercise that.
 */
function phone() {
  const operator = pick(["555", "550", "700", "705", "770", "777", "999", "990"]);
  const digits = String(between(100000, 999999));
  return rand() < 0.5 ? `+996 ${operator} ${digits.slice(0, 3)} ${digits.slice(3)}` : `0${operator}${digits}`;
}

function sameNumberOtherSpelling(value) {
  const digits = value.replace(/\D/g, "").slice(-9);
  return value.startsWith("+") ? `0${digits}` : `+996 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

function person() {
  const woman = rand() < 0.7;
  const surname = pick(SURNAMES);
  const name = woman ? `${pick(WOMEN)} ${surname}а` : `${pick(MEN)} ${surname}`;
  return { name, phone: phone(), address: `${pick(STREETS)}, ${between(1, 180)}` };
}

// ---------------------------------------------------------------------------
// Existing mock data

async function listMockUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`could not list users: ${error.message}`);
    users.push(...data.users.filter((u) => u.email?.endsWith(`@${MOCK_DOMAIN}`)));
    if (data.users.length < 1000) return users;
  }
}

async function listMockOrders() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("orders")
      // `status` too: only the confirmed ones ever raised purchase_count, so only those may give
      // it back on --reset. Without it soldQuantities sees undefined and takes back nothing.
      .select("id, items, status")
      .like("comment", `${MOCK_COMMENT}%`)
      .order("id")
      .range(from, from + 999);
    if (error) fail(`could not read orders: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const existingUsers = await listMockUsers();
const existingOrders = await listMockOrders();
if ((existingUsers.length || existingOrders.length) && !RESET) {
  fail(
    `staging already holds mock data (${existingOrders.length} orders, ${existingUsers.length} accounts).\n` +
      "Pass --reset to replace it — running again without it would double every number on the dashboard.",
  );
}

// ---------------------------------------------------------------------------
// Catalogue

const products = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("products")
    .select("id, name, price, image_url")
    .eq("published", true)
    .gt("price", 0)
    .order("id")
    .range(from, from + 999);
  if (error) fail(`could not read products: ${error.message}`);
  products.push(...data);
  if (data.length < 1000) break;
}
if (ORDER_COUNT > 0 && products.length === 0) {
  fail("staging has no published products with a price. Run seed-staging.mjs first.");
}

// A shop's sales are not uniform over its catalogue: a few dozen products carry most of it. Without
// that skew the "Топ товаров" card would be ten products that each sold twice.
const hot = new Set();
while (hot.size < Math.min(30, products.length)) hot.add(pick(products).id);
const productWeight = (p) => (hot.has(p.id) ? 12 : 1);

// ---------------------------------------------------------------------------
// Plan

/**
 * Mostly the hot products — people save what everyone buys — plus a few that nobody does, which is
 * the case the favorites card exists to catch: wanted, but not bought.
 */
function favoritesFor() {
  const ids = new Set();
  const count = between(3, 10);
  while (ids.size < Math.min(count, products.length)) {
    ids.add(rand() < 0.6 ? weighted(products, productWeight).id : pick(products).id);
  }
  return [...ids];
}

const accounts = Array.from({ length: USER_COUNT }, (_, i) => ({
  email: `mock-${String(i + 1).padStart(2, "0")}@${MOCK_DOMAIN}`,
  ...person(),
  favorites: products.length ? favoritesFor() : [],
}));

// Guests outnumber accounts, as they do on the real shop. `loyalty` is how often a customer comes
// back: most buy once, a few are regulars — which is what gives "новые vs повторные" two sides.
const customers = [
  ...accounts.map((account) => ({ ...account, account, loyalty: pick([1, 2, 4, 8]) })),
  ...Array.from({ length: Math.max(1, Math.round(ORDER_COUNT / 2.5)) }, () => ({
    ...person(),
    account: null,
    loyalty: pick([1, 1, 1, 1, 2, 3]),
  })),
];

const now = Date.now();
const DAY_MS = 86_400_000;
const BISHKEK_OFFSET_MS = 6 * 3_600_000;

/**
 * Orders lean towards the recent end of the window, so the chart shows a shop that is growing
 * rather than a flat line — and never land in the future or at 4 a.m. Bishkek time.
 */
function placedAt() {
  const daysAgo = Math.floor(DAYS * rand() ** 1.6);
  const localMidnight = Math.floor((now + BISHKEK_OFFSET_MS) / DAY_MS) * DAY_MS - daysAgo * DAY_MS;
  const localTime = localMidnight + between(9 * 60, 22 * 60 + 59) * 60_000 + between(0, 59) * 1000;
  return Math.min(localTime - BISHKEK_OFFSET_MS, now - between(1, 60) * 60_000);
}

/** What a real order of that age would be by now: the older, the more likely it has been delivered. */
function statusFor(ageDays) {
  if (rand() < 0.08) return "cancelled";
  if (ageDays < 1) return pick(["new", "new", "confirmed"]);
  if (ageDays < 3) return pick(["confirmed", "processing", "processing", "delivered"]);
  if (ageDays < 7) return pick(["processing", "delivered", "delivered", "delivered"]);
  return "delivered";
}

function basket() {
  const lines = new Map();
  const target = between(1, 5);
  let goods = 0;
  // Keep adding until the basket both has its lines and clears the minimum checkout accepts.
  while (lines.size < target || goods < MIN_ORDER_TOTAL) {
    const product = weighted(products, productWeight);
    const quantity = weighted([1, 2, 3, 6].map((q, i) => ({ q, weight: [70, 20, 8, 2][i] }))).q;
    const line = lines.get(product.id) ?? {
      id: product.id,
      name: product.name,
      price: Number(product.price),
      image_url: product.image_url ?? "",
      quantity: 0,
    };
    line.quantity += quantity;
    goods += line.price * quantity;
    lines.set(product.id, line);
    if (lines.size >= 12) break;
  }
  return { items: [...lines.values()], goods: Math.round(goods * 100) / 100 };
}

const orders = [];
for (let i = 0; i < ORDER_COUNT; i += 1) {
  const customer = weighted(customers, (c) => c.loyalty);
  const at = placedAt();
  const { items, goods } = basket();
  const zone = weighted(DELIVERY);
  const delivery = deliveryCost(zone, goods);

  // Account holders do not always sign in before checkout; and once in a while a guest's number
  // is written the other way round — both are orders the dashboard must still attribute correctly.
  const signedIn = customer.account && rand() < 0.8;
  const customerPhone = rand() < 0.15 ? sameNumberOtherSpelling(customer.phone) : customer.phone;
  const address = zone.id === "regions" ? `г. ${pick(TOWNS)}, ${customer.address}` : customer.address;

  orders.push({
    email: signedIn ? customer.account.email : null,
    row: {
      customer_name: customer.name,
      customer_phone: customerPhone,
      customer_address: address,
      comment: `${MOCK_COMMENT} тестовый заказ`,
      items,
      total: Math.round((goods + delivery) * 100) / 100,
      delivery_type: zone.id,
      delivery_cost: delivery,
      status: statusFor((now - at) / DAY_MS),
      created_at: new Date(at).toISOString(),
      // Marked as notified: a mock order is not one anybody should be chasing a missing email for.
      notified_at: new Date(at + 5000).toISOString(),
      // Written rather than left to the column default, so a planned order can be matched to the
      // row the database actually inserted — reviews reference an order by its id, and ids only
      // exist after the insert.
      review_token: randomUUID(),
    },
  });
}
orders.sort((a, b) => a.row.created_at.localeCompare(b.row.created_at));

// ---------------------------------------------------------------------------
// Report

const revenue = orders.filter((o) => o.row.status !== "cancelled").reduce((sum, o) => sum + o.row.total, 0);
const count = (key) =>
  orders.reduce(
    (acc, o) => ({ ...acc, [o.row[key]]: (acc[o.row[key]] ?? 0) + 1 }),
    /** @type {Record<string, number>} */ ({}),
  );

console.log(`
catalogue:   ${products.length} published products, ${hot.size} of them "hot"
remove:      ${existingOrders.length} mock orders, ${existingUsers.length} mock accounts${RESET ? "" : " (none — no --reset)"}
create:      ${accounts.length} accounts, ${orders.length} orders over ${DAYS} days (seed ${SEED})
favorites:   ${accounts.reduce((sum, a) => sum + a.favorites.length, 0)} across the mock accounts
guests:      ${orders.filter((o) => !o.email).length} of ${orders.length} orders
revenue:     ${Math.round(revenue).toLocaleString("ru-RU")} сом, cancelled excluded
statuses:    ${JSON.stringify(count("status"))}
delivery:    ${JSON.stringify(count("delivery_type"))}`);
if (orders.length) {
  const first = orders[0].row.created_at.slice(0, 10);
  const last = orders.at(-1).row.created_at.slice(0, 10);
  console.log(`dates:       ${first} … ${last}`);
}

if (!target.execute) {
  console.log("\nDry run. Re-run with --execute to write.");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Remove the previous mock data

/**
 * purchase_count per product, over the orders that count as a purchase.
 *
 * Only confirmed / processing / delivered, because that is the rule the shop now follows: the
 * counter moves when an admin confirms an order, not when a customer places it (`purchaseCountDelta`
 * in lib/constants.ts). Counting every mock order here would give staging a "Популярные" shelf
 * production could not produce — which is exactly the kind of divergence this seed exists to avoid.
 */
const COUNTED_STATUSES = new Set(["confirmed", "processing", "delivered"]);

function soldQuantities(rows) {
  const sold = new Map();
  for (const row of rows) {
    if (!COUNTED_STATUSES.has(row.status)) continue;
    for (const item of row.items ?? []) sold.set(item.id, (sold.get(item.id) ?? 0) + item.quantity);
  }
  return sold;
}

if (existingOrders.length) {
  // Counts first, while the orders that explain them still exist. Only what mock orders added is
  // taken back, so a real test purchase made on staging keeps its count.
  for (const [id, quantity] of soldQuantities(existingOrders)) {
    const { data, error } = await db.from("products").select("purchase_count").eq("id", id).maybeSingle();
    if (error) fail(`could not read purchase_count of ${id}: ${error.message}`);
    if (!data) continue; // product deleted since — nothing to give back
    const { error: updateError } = await db
      .from("products")
      .update({ purchase_count: Math.max(0, data.purchase_count - quantity) })
      .eq("id", id);
    if (updateError) fail(`could not reset purchase_count of ${id}: ${updateError.message}`);
  }

  const ids = existingOrders.map((o) => o.id);
  for (let i = 0; i < ids.length; i += 200) {
    // Reviews first: reviews.order_id is ON DELETE RESTRICT, so an order that was reviewed cannot
    // be deleted while the review stands. That is the right rule for production — deleting an order
    // must not silently erase what a customer wrote — and it means this script has to clean up
    // after itself explicitly, since the reviews above are its own.
    const { error: reviewError } = await db
      .from("reviews")
      .delete()
      .in("order_id", ids.slice(i, i + 200));
    if (reviewError) fail(`could not delete mock reviews: ${reviewError.message}`);

    const { error } = await db
      .from("orders")
      .delete()
      .in("id", ids.slice(i, i + 200));
    if (error) fail(`could not delete mock orders: ${error.message}`);
  }
  console.log(`\nremoved ${ids.length} mock orders (with their reviews)`);
}

for (const user of existingUsers) {
  // profiles cascades with the account.
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) fail(`could not delete ${user.email}: ${error.message}`);
}
if (existingUsers.length) console.log(`removed ${existingUsers.length} mock accounts`);

// ---------------------------------------------------------------------------
// Write

/** One password for every mock account, printed once — so any of them can be signed in as. */
function generatePassword() {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  do {
    out = Array.from({ length: 16 }, () => alphabet[randomInt(alphabet.length)]).join("");
  } while (!/[a-z]/.test(out) || !/[A-Z]/.test(out) || !/[0-9]/.test(out));
  return out;
}

const password = generatePassword();
const idByEmail = new Map();
for (const account of accounts) {
  const { data, error } = await db.auth.admin.createUser({
    email: account.email,
    password,
    email_confirm: true,
    user_metadata: { mock: true, name: account.name },
  });
  if (error) fail(`could not create ${account.email}: ${error.message}`);
  idByEmail.set(account.email, data.user.id);

  const { error: profileError } = await db
    .from("profiles")
    .upsert({ id: data.user.id, name: account.name, phone: account.phone, address: account.address });
  if (profileError) fail(`could not write the profile of ${account.email}: ${profileError.message}`);

  // No cleanup needed on --reset: favorites.user_id cascades when the account is deleted.
  if (account.favorites.length) {
    const { error: favoritesError } = await db
      .from("favorites")
      .insert(account.favorites.map((productId) => ({ user_id: data.user.id, product_id: productId })));
    if (favoritesError) fail(`could not write favorites of ${account.email}: ${favoritesError.message}`);
  }
}
if (accounts.length) console.log(`created ${accounts.length} mock accounts`);

const rows = orders.map((o) => ({ ...o.row, user_id: o.email ? idByEmail.get(o.email) : null }));
// Reviews reference an order by id, and ids are assigned by the database. The token each row
// carries is unique, so it is what links a planned order back to the row that was actually written.
const insertedIdByToken = new Map();
for (let i = 0; i < rows.length; i += 200) {
  const { data, error } = await db
    .from("orders")
    .insert(rows.slice(i, i + 200))
    .select("id, review_token");
  if (error) fail(`could not insert orders [${i}..${i + 200}): ${error.message}`);
  for (const row of data ?? []) insertedIdByToken.set(row.review_token, row.id);
}
if (rows.length) console.log(`created ${rows.length} mock orders`);

// Reviews on the delivered orders that belong to an account -------------------------------------
//
// Without these, staging shows the feature switched off: no stars on a card, no block on a product
// page, nothing in the moderation queue. Only delivered orders placed by a mock account qualify,
// which is the same rule app/review/actions.ts enforces — a review needs a user_id, and a guest
// order has none until its buyer signs in through the review link.
//
// A third are left `pending` so the admin's queue is not empty, and a few are `rejected`, so the
// tabs have something in them. No cleanup on --reset: reviews.user_id cascades with the account.
const REVIEW_BODIES = [
  "Пользуемся давно, берём уже не первый раз. Всё отлично.",
  "Пришло быстро, упаковано аккуратно. Рекомендую.",
  "Товар хороший, но цена кусается.",
  "Ожидала большего, запах слишком резкий.",
  "Нормально за свои деньги.",
  "Прекрасное средство, расходуется экономно.",
  null,
  null,
];

// The published form of a name: "Айгерим Садыкова" → "Айгерим С.". Duplicated from
// lib/reviews.ts `displayAuthorName` for the same reason the delivery tariff is — scripts are plain
// ESM with no TS step. A stale copy only makes the mock data slightly off.
const shortName = (full) => {
  const parts = String(full ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return null;
  const [first, ...rest] = parts;
  const surname = rest.at(-1);
  return surname ? `${first} ${[...surname][0].toUpperCase()}.` : first;
};

const reviewRows = [];
const reviewedPairs = new Set();
for (const o of orders) {
  if (o.row.status !== "delivered" || !o.email) continue;
  const userId = idByEmail.get(o.email);
  if (!userId) continue;
  const orderId = insertedIdByToken.get(o.row.review_token);
  if (!orderId) continue;
  // Not every delivered order gets one — a 100% review rate would be the least realistic thing on
  // the whole of staging.
  if (rand() > 0.45) continue;
  for (const item of o.row.items) {
    // One review per customer per product, the same rule the unique constraint enforces — a repeat
    // buyer of the same powder gets one opinion, not one per order. Keyed across all of this
    // customer's orders, not just this one.
    const key = `${userId}:${item.id}`;
    if (reviewedPairs.has(key)) continue;
    reviewedPairs.add(key);
    const roll = rand();
    reviewRows.push({
      product_id: item.id,
      order_id: orderId,
      user_id: userId,
      // Skewed high, the way real ratings are: someone who disliked it usually just does not write.
      rating: roll < 0.55 ? 5 : roll < 0.8 ? 4 : roll < 0.92 ? 3 : between(1, 2),
      body: pick(REVIEW_BODIES),
      author_name: shortName(o.row.customer_name),
      status: roll < 0.66 ? "approved" : roll < 0.9 ? "pending" : "rejected",
    });
  }
}

if (reviewRows.length) {
  for (let i = 0; i < reviewRows.length; i += 200) {
    const { error } = await db.from("reviews").insert(reviewRows.slice(i, i + 200));
    if (error) fail(`could not insert reviews [${i}..${i + 200}): ${error.message}`);
  }
  console.log(`created ${reviewRows.length} mock reviews (the trigger rates the products)`);
}

// The same RPC the admin calls on a status change, so the counts land where a real sale puts them.
const sold = soldQuantities(rows);
if (sold.size) {
  const { error } = await db.rpc("increment_product_purchase_counts", {
    items: [...sold].map(([id, qty]) => ({ id, qty })),
  });
  if (error) fail(`orders are in, but purchase_count was not updated: ${error.message}`);
  console.log(`purchase_count raised on ${sold.size} products`);
}

if (accounts.length) {
  console.log(`
Mock accounts: ${accounts[0].email} … ${accounts.at(-1).email}
Password (all of them, printed once): ${password}

/popular and the homepage carousel are cached for up to 10 minutes — they catch up on their own.`);
}

function fail(message) {
  console.error(`\nseed-staging-orders: ${message}\n`);
  process.exit(1);
}
