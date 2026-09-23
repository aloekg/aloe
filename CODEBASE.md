# Aloe.kg — Project Reference

## Tech Stack

- **Framework:** Next.js 16.2.9 (App Router, Server Components, Server Actions, React 19)
- **Language:** TypeScript 6.0.3 (strict mode, path alias `@/*` → root)
- **Database:** Supabase (PostgreSQL + Auth + Storage + RLS)
- **State:** Zustand 5.0.14 (cart and favorites use `persist`/localStorage; toast doesn't — both cart and favorites also rehydrate from Supabase on auth)
- **Styling:** Tailwind CSS 4.3.1, no dark mode
- **UI libs:** Lucide React, React Icons, Embla Carousel (+ autoplay), react-markdown, nextjs-toploader, @tailwindcss/typography, @tanstack/react-virtual
- **Code quality:** ESLint 9, Prettier (120 char, import sorting via `@ianvs/prettier-plugin-sort-imports`)

## Directory Structure

```
/
├── app/                    # Next.js App Router pages
├── components/             # ~40 shared components + components/header/ (barrel: components/index.ts)
├── hooks/                  # Custom React hooks
├── lib/                    # Supabase clients, caching, utilities
├── services/               # Data access layer (9 domain modules)
├── store/                  # Zustand stores (cart, favorites, toast)
├── types/                  # TypeScript type definitions (index.ts) + generated database.ts
├── tests/                  # Vitest unit tests (pure helpers only — no DB, no DOM)
├── supabase/               # migrations/ (source of truth for the schema), sql/audit-rls.sql
├── public/                 # Manifest PNG icons (generated, see scripts/generate-app-icons.mjs)
├── scripts/                # Maintenance: images, orphan categories, staging seed (see below)
├── proxy.ts                # Middleware — Supabase auth cookie management
├── next.config.ts          # Image optimization disabled (unoptimized: true), devIndicators off
└── .env.local              # Supabase keys, SMTP, DEPLOY_ORIGIN (see below)
```

## App Routes

```
/                           # Home page (carousels: popular, new, sale, categories)
/auth                       # Login / register (email+password, Google OAuth)
/auth/confirm               # Email OTP verification & OAuth PKCE callback (route.ts)
/product/[id]               # Product detail page
/catalog                    # All categories index
/catalog/[slug]             # Category listing with filters — all subcategories in one scrollable view (see note below)
/brands                     # All brands index (alphabetical)
/brands/[brand]             # Brand product listing (infinite scroll)
/search                     # Search results with filters
/cart                       # Shopping cart
/checkout                   # Order form
/checkout/success           # Order confirmation
/profile                    # User profile, orders, favorites (auth required)
/favorites                  # Saved items
/delivery                   # Delivery info
/about                      # About page (static)
/contacts                   # Contacts page (static)
/legal-entities             # Info for corporate/legal clients (static)
/popular                    # Auto-derived from purchase_count (see note below), not a label
/new /sale                  # Label-based product pages
/admin                      # Admin dashboard (role: admin)
/admin/analytics            # Sales dashboard — totals vs previous period, trends, catalogue and customer insights
/admin/orders               # Order management
/admin/products             # Product CRUD
/admin/categories           # Category management (drag-to-reorder)
/admin/brands               # Brand management
/admin/banners              # Banner carousel management (desktop/mobile tabs)
/admin/users                # Accounts list; grant/revoke the admin role (role: superadmin only)

/catalog/product/view/[...path]  # route.ts — 301s old JoomShopping product URLs to /product/[id]
```

Note: the `discount` label/route from earlier iterations has been removed — `Product["label"]` is now only `"new" | "sale" | null`.

Note: "popular" is no longer a manually-set admin label. `products.purchase_count` is incremented atomically (via the `increment_product_purchase_counts` Postgres RPC) in `app/checkout/actions.ts` when an order is placed, and `/popular` + the homepage carousel rank published products by `purchase_count` (`getPopularProducts` / `getPopularProductsPaginated` in `product.service.ts`, `getCachedPopularProducts` in `cached-queries.ts`). Products with `purchase_count = 0` are excluded, so the section stays hidden until at least one order has been placed.

**Quick-view modal:** `/product/[id]` also renders as a modal overlay via a parallel route — `app/@modal/(.)product/[id]/page.tsx` intercepts client-side navigation from `ProductCard`'s `<Link>` and renders it inside `components/ProductModal.tsx` (closes on `Esc`/backdrop click via `router.back()`). A direct/hard navigation still renders the full `/product/[id]` page. `app/@modal/default.tsx` renders `null` when no intercept matches. The shell lives in `app/@modal/(.)product/[id]/layout.tsx`, not in the page: `page`/`loading`/`error` swap places inside a Suspense boundary, and wrapping each of them would remount the sheet and replay its open animation when the product data lands. That is also why the sheet has a fixed height rather than a `max-h` — it must not resize when the skeleton is replaced — and why the folder has its own `not-found.tsx`.

Those links pass `scroll={false}` (`ProductCard`, and `router.push` in `AutocompleteDropdown`). The modal is `position: fixed`, which Next's post-navigation scroll handler skips (`shouldSkipElement` in `layout-router`), so with nothing left to consider it falls back to `documentElement.scrollTop = 0` — opening a quick view sent the grid behind it to the top, which showed up on closing and reset the category page's sticky subcategory bar out of its scrolled layout.

**Category page (`/catalog/[slug]`):** renders every subcategory of the top-level category as its own section in one `VirtualCategoryContent` window-virtualized scroll (`@tanstack/react-virtual`). `SubcategoryFilter` renders a pill per subcategory; clicking one calls `scrollToSection` (`lib/section-scroll.ts`) to jump to it, and the pill that's currently scrolled into view is tracked via `lib/active-section.ts` pub/sub and highlighted (`useActiveSectionSync`). As the active section changes, `SubcategoryFilter` mirrors it into the URL as `?sub=<subcategorySlug>` via `history.replaceState` directly (not `router.replace`) so the address bar stays shareable/bookmarkable without forcing a server re-render on every scroll tick. Landing on `/catalog/[slug]?sub=<slug>` (a shared link, a reload, or the breadcrumb/sitemap links below) resolves that slug to a subcategory id server-side and passes it to `VirtualCategoryContent` as `initialSectionId`, which scrolls to it on mount — reasserting the scroll position for the first ~20 frames to win a race against the App Router's own post-navigation scroll handling, which otherwise snaps it back to the top a couple of frames after mount.

**Filters on the category page:** `CategoryBrowser` wraps the filter bar, `SubcategoryFilter` and
`VirtualCategoryContent` so the three agree on one set of sections. The server already sent every
product of the category, so **narrowing and reordering happen on the client and cost nothing** — no
server round trip, no Data Cache lookup — and the result is mirrored into `?sort=`/`?price_min=`/
`?price_max=` through `history.replaceState`, the same mechanism and the same reason as `?sub=`.
`hooks/useFilterNav.ts` owns that merge for the whole storefront, including the rule that any filter
change resets `?page=`; it reads `window.location.search` at call time rather than closing over
`useSearchParams()`, because two writers share the query string here and a cached copy would have
each silently drop the other's key. **Sorting by price orders within each section, never across
them** — a flat list would break the pills, `section-scroll.ts`, `active-section.ts`, the `?sub=`
contract and the `/catalog/[topSlug]?sub=[subSlug]` links — so the UI says "в каждом разделе". No
filter control renders a link (`SortSelect` is a `<select>`, `PriceFilter` two inputs), which is
what keeps faceted URLs uncrawlable; `Pagination` is the only `<a href>` carrying query parameters,
and it carries every active filter so page 2 shows the same result set.

**Sub-subcategories (3rd level):** `categories.parent_id` is self-referential, so a category can be nested one level deeper than a normal subcategory (category → subcategory → sub-subcategory). Sub-subcategories have **no page of their own** — `products.category_id` may point directly at one (instead of at the subcategory), and `/catalog/[slug]` groups that subcategory's products into per-sub-subcategory sections within its section rather than routing to a new URL. `getCategoryProducts` (cached as `getCachedCategoryProducts`) takes every category id under the top-level one in one query and returns the rows bucketed by `category_id`, so products assigned at either level arrive together; `buildCategorySection()` in `lib/subcategory-sections.ts` then splits each subcategory's bucket into per-sub-subcategory groups. `sitemap.ts`, the homepage carousel grouping (`app/page.tsx`), and the product-detail breadcrumbs (`app/product/[id]/page.tsx`) all walk up to 2 `parent_id` hops to resolve the real top-level/subcategory pair, and link to the subcategory as `/catalog/[topSlug]?sub=[subSlug]`. Admin: `AdminCategories.tsx` renders 3 tiers and only allows a subcategory (not a sub-subcategory) as a parent, capping the tree at 3 levels; the product editor's category `<select>` only offers leaf categories **below the top level** — a subcategory or sub-subcategory with no children of its own, labeled with its full breadcrumb path. A childless top-level category is a leaf by that test alone and used to be offered; a product assigned to one renders nowhere, because `/catalog/[slug]` builds its sections from subcategory ids and then calls `notFound()`.

## Database Schema (Supabase / PostgreSQL)

The schema lives in `supabase/migrations/` and is applied with `npx supabase db push`; `types/database.ts`
is generated from it (`npm run db:types`) and committed. See [supabase/README.md](supabase/README.md)
for the migration list and the recorded RLS audit.

`products.category_id` and `category` are nullable on purpose: 91 products were orphaned by the
category FK's old `ON DELETE SET NULL` and have no category until an admin assigns one. The
invariant the storefront relies on is narrower and lives in a CHECK instead — a **published**
product must be categorised (`products_published_has_category`) — and the FK is now
`ON DELETE RESTRICT`.

Two migrations dated 2026-09-21 close what the schema never stated. `..._schema_integrity.sql` adds
the `categories.parent_id` self-FK, the `orders.status` CHECK and `products.external_id` UNIQUE, and
drops the three dead "admin write" policies on `categories`/`brands`/`banners` — they were `FOR ALL`
to PUBLIC, inert only because insert/update/delete are revoked from `anon`/`authenticated`, and
nothing used them (every admin write goes through the service role). Three of those constraints
**abort the migration** if the data does not already satisfy them, which is the point: the file's
header carries the pre-flight queries to run against production first. `..._indexes_followup.sql`
adds the indexes the earlier pass missed — `cart_items.product_id` and `favorites.product_id` (both
cascade from `products`, so every delete scanned them in full), `orders (created_at desc, id desc)`
for the admin list and the analytics fetch, and a trigram index on `products.product_url`, which the
legacy 301s match with a leading wildcard no btree can serve.

### products

| column         | type        | notes                                                                                                                                                                                                                                                |
| -------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id             | int         | PK                                                                                                                                                                                                                                                   |
| external_id    | text        | JoomShopping `product_id` on the old store — a record of provenance, read by no code now that the sync scripts are gone (not in `Product` or the admin UI). UNIQUE since 2026-09-21; NULL is unconstrained, so admin-created products are unaffected |
| name           | text        |                                                                                                                                                                                                                                                      |
| price          | numeric     |                                                                                                                                                                                                                                                      |
| old_price      | numeric     | nullable                                                                                                                                                                                                                                             |
| image_url      | text        | large variant (≤1200px WebP) — detail page & modal                                                                                                                                                                                                   |
| thumbnail_url  | text        | nullable — small variant (≤500px WebP) for cards; fall back to `image_url`                                                                                                                                                                           |
| product_url    | text        | unused — dropped from `Product` type & admin UI                                                                                                                                                                                                      |
| category       | text        | string label                                                                                                                                                                                                                                         |
| category_id    | int         | FK → categories.id                                                                                                                                                                                                                                   |
| label          | text        | `new` \| `sale` \| null                                                                                                                                                                                                                              |
| description    | text        | nullable                                                                                                                                                                                                                                             |
| brand_id       | int         | FK → brands.id                                                                                                                                                                                                                                       |
| seo_text       | text        | nullable                                                                                                                                                                                                                                             |
| purchase_count | int         | incremented on checkout; drives "popular" ranking                                                                                                                                                                                                    |
| published      | boolean     |                                                                                                                                                                                                                                                      |
| created_at     | timestamptz |                                                                                                                                                                                                                                                      |

### categories

| column     | type | notes                                                                                                                                                                                                                                                                                          |
| ---------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id         | int  | PK                                                                                                                                                                                                                                                                                             |
| name       | text |                                                                                                                                                                                                                                                                                                |
| slug       | text |                                                                                                                                                                                                                                                                                                |
| parent_id  | int  | self-referential FK, `on delete restrict` / `on update cascade` — actually declared only since 2026-09-21, before which the whole tree hung off an unconstrained column; null = top-level, up to 3 levels deep (category → subcategory → sub-subcategory) — see "Sub-subcategories" note above |
| image_url  | text | nullable                                                                                                                                                                                                                                                                                       |
| sort_order | int  | manual ordering, editable via admin drag-reorder                                                                                                                                                                                                                                               |

### brands

| column | type | notes |
| ------ | ---- | ----- |
| id     | int  | PK    |
| name   | text |       |
| slug   | text |       |

### banners

| column     | type    | notes                 |
| ---------- | ------- | --------------------- |
| id         | int     | PK                    |
| image_url  | text    |                       |
| sort_order | int     |                       |
| active     | boolean |                       |
| link       | text    | nullable              |
| type       | text    | `desktop` \| `mobile` |

### profiles

| column     | type        | notes           |
| ---------- | ----------- | --------------- |
| id         | uuid        | FK → auth.users |
| name       | text        |                 |
| phone      | text        |                 |
| address    | text        |                 |
| updated_at | timestamptz |                 |

### orders

| column           | type        | notes                                                                                                                         |
| ---------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| id               | int         | PK                                                                                                                            |
| user_id          | uuid        | nullable FK → auth.users (guest checkout allowed)                                                                             |
| customer_name    | text        |                                                                                                                               |
| customer_phone   | text        |                                                                                                                               |
| customer_address | text        |                                                                                                                               |
| comment          | text        | nullable                                                                                                                      |
| items            | jsonb       | array of cart items (frozen at checkout, incl. image URLs)                                                                    |
| total            | numeric     | goods + delivery                                                                                                              |
| delivery_type    | text        | nullable                                                                                                                      |
| delivery_cost    | numeric     | not null, default 0                                                                                                           |
| status           | text        | `new` \| `confirmed` \| `processing` \| `delivered` \| `cancelled` — CHECK-constrained to those five, matching `ORDER_STATUS` |
| notified_at      | timestamptz | nullable — when the admin email was confirmed sent; NULL = never                                                              |
| created_at       | timestamptz |                                                                                                                               |

### cart_items

| column     | type        | notes                                |
| ---------- | ----------- | ------------------------------------ |
| id         | int         | PK                                   |
| user_id    | uuid        | FK → auth.users, `on delete cascade` |
| product_id | int         | FK → products, `on delete cascade`   |
| quantity   | int         | default 1                            |
| created_at | timestamptz |                                      |

`unique (user_id, product_id)` — that pair, not `id`, is what the upsert in `cart.service.ts` conflicts on.

### favorites

| column     | type        | notes                                |
| ---------- | ----------- | ------------------------------------ |
| id         | int         | PK                                   |
| user_id    | uuid        | FK → auth.users, `on delete cascade` |
| product_id | int         | FK → products, `on delete cascade`   |
| created_at | timestamptz |                                      |

`unique (user_id, product_id)`, same as `cart_items`.

### rate_limits

| column       | type        | notes               |
| ------------ | ----------- | ------------------- |
| bucket       | text        | PK part             |
| key          | text        | PK part — client IP |
| window_start | timestamptz |                     |
| hits         | int         |                     |

Fixed-window counters for public server actions. RLS on with no policy and no grants: only the
service role touches it, through the `rate_limit_hit(bucket, key, limit, window)` function
(`lib/rate-limit.ts`).

**Storage buckets:** `product-images` (product photos), `banners` (banner images), `categories`
(category images) — all three public, created by `supabase/migrations/20260915090000_storage_buckets.sql`.
Their `file_size_limit` / `allowed_mime_types` are not the same as the checks in
`app/admin/actions.ts` and are not meant to be: product and banner uploads are re-encoded by `sharp`
first, so the action accepts a 15 MB phone original while the bucket only ever sees the WebP
derivative. Category images are the exception — `uploadImage()` stores them as uploaded, so there
the bucket's 2 MB is the real limit.

## TypeScript Types (`/types/index.ts`)

```typescript
type Brand = { id: number; name: string; slug: string };

type Product = {
  id: number;
  name: string;
  price: number;
  image_url: string; // large (≤1200px)
  thumbnail_url?: string | null; // small (≤500px), null → use image_url
  category: string;
  category_id: number;
  label?: "new" | "sale" | null;
  old_price?: number | null;
  description?: string | null;
  brand_id?: number | null;
  brand_name?: string | null;
  seo_text?: string | null;
  purchase_count: number;
  published: boolean;
};

type ProductRow = Product & { brands: { name: string } | null };

/**
 * What a product card renders, and all that list queries select — `description`/`seo_text` are long
 * free text and would otherwise dominate every grid payload (and push cached category pages past
 * the 2 MB data-cache entry limit).
 */
type ProductListItem = {
  id: number;
  name: string;
  price: number;
  old_price?: number | null;
  image_url: string;
  thumbnail_url?: string | null;
  category_id: number;
  label?: "new" | "sale" | null;
  brand_id?: number | null;
  brand_name?: string | null;
};

type ProductListRow = Omit<ProductListItem, "brand_name"> & { brands: { name: string } | null };

// Flattens the brands join on either shape.
function withBrandName<T extends { brands?: { name: string } | null }>(
  rows: T[],
): Array<Omit<T, "brands"> & { brand_name: string | null }>;

type CartItem = { id: number; name: string; price: number; image_url: string; quantity: number };
/** A cart item frozen into an order — every field re-derived server-side at checkout. */
type OrderItem = CartItem;

// Derived from the generated schema, so a renamed or newly-nullable column fails the build.
type ProductRecord = Tables["products"]["Row"]; // raw row, used by the admin list and edit drawer
type Category = Tables["categories"]["Row"];
type Banner = Tables["banners"]["Row"];
type Profile = Tables["profiles"]["Row"];
type ProfileFields = Pick<Profile, "name" | "phone" | "address">;
type Order = Omit<Tables["orders"]["Row"], "items"> & { items: OrderItem[] };
```

## Services (`/services/`)

| file                   | purpose                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `product.service.ts`   | Product CRUD, label/category/brand queries, search, autocomplete, admin listing      |
| `brand.service.ts`     | Brand queries (public + admin)                                                       |
| `category.service.ts`  | Category tree queries (public + admin, ordered by `sort_order`)                      |
| `order.service.ts`     | Order creation & listing, admin listing + status counts                              |
| `profile.service.ts`   | User profile read/write                                                              |
| `cart.service.ts`      | DB cart sync (auth users): load/upsert/delete/clear/reconcile                        |
| `favorites.service.ts` | DB favorites sync (auth users): load ids, add/remove, full product list              |
| `banner.service.ts`    | Banner queries, split by `type` (`desktop`/`mobile`)                                 |
| `user.service.ts`      | Account list for the admin — Auth admin API + `profiles`, service-role only          |
| `analytics.service.ts` | Rows the admin dashboard aggregates — orders, customer history, catalogue, favorites |

## Lib Utilities (`/lib/`)

| file                      | purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase-server.ts`      | `createClient()` — SSR Supabase with cookies                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `supabase-browser.ts`     | `createClient()` — client-side Supabase                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `supabase.ts`             | Direct anon-key client (used by `unstable_cache()` wrappers)                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `cn.ts`                   | `cn(...classes)` — clsx + tailwind-merge                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `cached-queries.ts`       | ISR-cached wrappers via `unstable_cache()`                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `auth.ts`                 | `requireAuth()` — server-side auth guard, redirects to `/auth`                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `constants.ts`            | `SITE_URL`/`LEGACY_SITE_URL`/`SPECIALS_BASE_URL`, `LABEL_MAP` (badge text/color for `new`/`sale`), `ORDER_STATUS` (label/color), the delivery tariff: `DELIVERY_OPTIONS`, `FREE_DELIVERY_THRESHOLD`, `getDeliveryCost()`, `deliveryFreeNote()`, and `MIN_ORDER_TOTAL` (the smallest basket checkout accepts)                                                                                                                                                                                          |
| `page-params.ts`          | `parsePage()`, `parseSortParam()`, `parseBrandIds()`, `parsePriceRange()` — URL helpers, and the single declaration of `SortValue`. An inverted `?price_min=500&price_max=100` drops **both** bounds rather than swapping them, so the filter UI never shows a range the customer did not type. `MAX_PAGE` is 500, not a runaway guard: every distinct `?page=` mints an ISR **and** a Data Cache entry (see "Cache budget"), and a page past the end 404s rather than serving an indexable empty 200 |
| `price-filter.ts`         | `filterByPrice()`, `sortProducts()`, `applyProductFilters()`, `filterCategorySections()`, `priceBounds()` — the storefront's sort and price filter, as pure array operations so the server and the client can apply the identical transform (`tests/price-filter.test.ts`)                                                                                                                                                                                                                            |
| `section-scroll.ts`       | Module-level singleton: `registerSectionScroller` / `scrollToSection` — lets `SubcategoryFilter` imperatively scroll `VirtualCategoryContent` without prop drilling                                                                                                                                                                                                                                                                                                                                   |
| `active-section.ts`       | Pub/sub for the currently-visible section ID: `setActiveSection` / `subscribeActiveSection` — `VirtualCategoryContent` fires updates on scroll, `SubcategoryFilter` highlights the active pill                                                                                                                                                                                                                                                                                                        |
| `db.ts`                   | `soft()` / `strict()` / `maybe()` — unwrap a Supabase response so a failed query stops looking like an empty one (`strict` where the result decides `notFound()`, `maybe()` for a `.maybeSingle()` lookup where "not found" is ordinary). Also `loadAllPages()` / `PAGE_ROWS` — reads a whole list through PostgREST's 1000-row ceiling and throws on a failed page, because a half-loaded list is indistinguishable from a short one (`app/sitemap.ts`, `analytics.service.ts`)                      |
| `supabase-admin.ts`       | `createAdminClient()` — service-role client, bypasses RLS; never construct without an admin check right before it                                                                                                                                                                                                                                                                                                                                                                                     |
| `safe-redirect.ts`        | `safeRedirect()` (same-origin `?next=` only) and `resolveOrigin()` (honours `x-forwarded-host` for allow-listed hosts only)                                                                                                                                                                                                                                                                                                                                                                           |
| `deploy-origin.ts`        | `DEPLOY_ORIGIN` / `IS_CANONICAL_HOST` — the origin this deployment actually serves on, as opposed to `SITE_URL`; drives the noindex guard and admin links in email. Unset on production since the cutover                                                                                                                                                                                                                                                                                             |
| `rate-limit.ts`           | `rateLimit()` — fixed-window limiter for public server actions, backed by the `rate_limit_hit` Postgres function; fails **open**                                                                                                                                                                                                                                                                                                                                                                      |
| `roles.ts`                | `adminRole()` / `isSuperAdmin()` — the only readers of `app_metadata.role`; see the Auth section below                                                                                                                                                                                                                                                                                                                                                                                                |
| `mailer.ts`               | Admin order notification over SMTP (`nodemailer`), with a narrowed TLS name check for the hoster's certificate                                                                                                                                                                                                                                                                                                                                                                                        |
| `invoice.ts`              | Order PDF (`pdfkit` + bundled Roboto in `lib/fonts/`), attached to the notification email                                                                                                                                                                                                                                                                                                                                                                                                             |
| `order-pricing.ts`        | `parseLines()`, `buildQuote()`, `publishedPriceLookup()`, `minOrderShortfall()`, `money()` — the one place order money is computed; kept out of the action file so it can be tested without a database (`tests/order-pricing.test.ts`). Admin order edits share it: `validateOrderItems()`, `normalizeOrderItems()`, `priceOrder()`, `isManualDeliveryCost()`, `parsePriceInput()` (see the admin-editing note below)                                                                                 |
| `analytics.ts`            | Pure aggregation behind `/admin/analytics`: shop-day/period helpers and `buildReport()` — kept free of the database so `tests/analytics.test.ts` can exercise the arithmetic                                                                                                                                                                                                                                                                                                                          |
| `analytics-insights.ts`   | `buildInsights()` — the dashboard's catalogue- and history-dependent sections (categories, brands, heatmap, promo, free-delivery threshold, cancellations, repeat purchases, favorites vs sales, unsold products); pure, tested in `tests/analytics-insights.test.ts`                                                                                                                                                                                                                                 |
| `subcategory-sections.ts` | `buildCategorySection()` — groups a subcategory's products by sub-subcategory for `VirtualCategoryContent`                                                                                                                                                                                                                                                                                                                                                                                            |
| `legacy-redirect.ts`      | `redirectLegacyProduct()` — resolves an old JoomShopping product URL against `products.product_url` at request time                                                                                                                                                                                                                                                                                                                                                                                   |
| `legacy-redirects.ts`     | Generated static map of the old site's non-product URLs (brands, categories, nav) → current ones; read by `proxy.ts`                                                                                                                                                                                                                                                                                                                                                                                  |
| `seo.ts`                  | `pageMetadata({ title, description, path })` — one page's title, description, canonical and Open Graph block together, since a page that sets only some of them inherits the home page's for the rest; also `OFFER_SHIPPING_DETAILS` / `MERCHANT_RETURN_POLICY`, the two blocks every product Offer carries                                                                                                                                                                                           |
| `csp.ts`                  | `buildContentSecurityPolicy()` — the CSP `next.config.ts` serves, assembled at **build** time from `NEXT_PUBLIC_SUPABASE_URL` (see the security-headers note below)                                                                                                                                                                                                                                                                                                                                   |
| `text.ts`                 | `CONTACT_LIMITS`, `normalizeText()` — the caps on the customer contact fields, shared by checkout and the profile form, because a server action's argument types are erased at runtime                                                                                                                                                                                                                                                                                                                |
| `whatsapp.ts`             | `toWhatsAppNumber()`, `whatsAppLink()`, `orderStatusMessage()` — prefilled `wa.me` links for the admin order list; nothing is sent automatically (see "WhatsApp" below)                                                                                                                                                                                                                                                                                                                               |

### Cached Queries (ISR tags & TTLs)

| function                                            | TTL    | tags                          |
| --------------------------------------------------- | ------ | ----------------------------- |
| `getCachedCategories()`                             | 1 hour | `categories`                  |
| `getCachedCategoriesWithSlug()`                     | 1 hour | `categories`                  |
| `getCachedBrands()`                                 | 1 hour | `brands`                      |
| `getCachedBrandBySlug(slug)`                        | 1 hour | `brands`                      |
| `getCachedActiveBanners()`                          | 1 hour | `banners`                     |
| `getCachedProductsByLabel(label, limit?)`           | 10 min | `products`                    |
| `getCachedProductsByLabelPaginated(label, page, …)` | 10 min | `products`                    |
| `getCachedPopularProducts(limit?)`                  | 10 min | `products` `products-popular` |
| `getCachedPopularProductsPaginated(page, pageSize)` | 10 min | `products` `products-popular` |
| `getCachedHomePageCategoryProducts(groups, limit?)` | 10 min | `products`                    |
| `getCachedCategoryProducts(categoryIds)`            | 10 min | `products`                    |
| `getCachedProductsByBrand(id, page, pageSize)`      | 10 min | `products`                    |
| `getCachedProduct(id)`                              | 10 min | `products`                    |
| `getCachedRelatedProducts(categoryId)`              | 10 min | `products`                    |

The two TTLs are named in `cached-queries.ts` — `CATALOGUE_TTL` (10 min) and `REFERENCE_TTL`
(1 hour). Neither is what keeps the site fresh: every write path invalidates by tag
(`updateTag("products")` on each admin mutation, `updateTag("products-popular")` at checkout), so
the TTL only backstops a row edited straight in the Supabase dashboard. It was 60 s until that cost
became visible — an entry that expires every minute is an entry **rewritten** every minute, and
Vercel's Hobby plan meters those against 200K ISR writes a month. See "Cache budget" below.

`getCachedCategoryProducts` returns tuples rather than the `Map` the service produces — a `Map`
cannot cross the `unstable_cache` boundary, so the caller rebuilds it. The extra `products-popular`
tag lets checkout expire the two purchase-count-ranked queries without dropping the whole catalogue
cache. It deliberately takes no brand filter, **no sort order and no price range**: each would fold
the chosen subset into the key and mint a ~90 KB entry per combination, so filtering belongs on the
cached result rather than in the query. `sort` was in this key until the storefront gained a control
for it — up to three entries per category for a feature no page exposed — and now lives in
`lib/price-filter.ts`, applied by `app/catalog/[slug]/page.tsx` and again by `CategoryBrowser` on the
client. Callers also sort the ids — `[1,2]` and `[2,1]` are otherwise two
entries for one payload, and the natural `sort_order` walk is re-permuted by an admin drag-reorder.

`getCachedRelatedProducts` is keyed by **category alone**. Its `excludeId` used to be in the key,
which made the cache hold one entry per product (2400+) where one per category (~90) says the same
thing; `getRelatedProducts` therefore fetches `RELATED_PRODUCTS_LIMIT + 1` rows with the viewed
product still among them, and `/product/[id]` filters itself out — so a product inside its own pool
still has four neighbours to show. The rendered result is identical to the old query's.

## Zustand Stores (`/store/`)

- **cart store** (`store/cart.ts`) — cart items array, persisted to localStorage (key `"cart"`, only `items` is persisted); syncs with DB when user logs in (local items win on conflict, DB-only items appended, `reconcileCartItems` pushes local-only items back).
- **favorites store** (`store/favorites.ts`) — product IDs; syncs with DB on auth. Persisted to localStorage (key `"favorites"`, `ids` + `userId`) so a returning customer's hearts are right on first paint and survive an offline reload; `userId` rides along because the ids belong to one account, and they are dropped whenever a different user signs in or the current one signs out. Unlike the cart there is nothing to keep for a guest — `FavoriteButton` sends them to `/auth` rather than storing anything. A failed load leaves `initialized` false, which both keeps the button disabled and lets the next auth event retry.
- **toast store** (`store/toast.ts`) — notification queue, auto-dismiss after 3.5s, keeps at most 3 toasts.
- **auth modal store** (`store/auth-modal.ts`) — whether the sign-in sheet is open, plus the product a guest was trying to favourite when it opened. Not persisted, like the toast store. `FavoriteButton` opens it instead of navigating to `/auth`, and `AuthModal` presses that heart once `favorites` reports the account's list loaded — adding any earlier writes into a store the `setUser` load is about to replace. A Google sign-in leaves the site, so that pending heart does not survive it; the sheet passes the current path as `next` so the customer at least comes back where they were.

## Server Actions

| file                            | actions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/checkout/actions.ts`       | `quoteOrder()` — re-derives item prices and the delivery charge server-side for the form; `createOrder()` — inserts via service-role client so guest (unauthenticated) checkout is allowed, clears the server-side cart, increments `purchase_count` and emails the admin with a PDF invoice                                                                                                                                                                                                                                  |
| `app/profile/actions.ts`        | `saveProfile()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `app/brands/[brand]/actions.ts` | `loadMoreBrandProducts()` — cached, paginated, backs the infinite-scroll brand page                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `app/admin/actions.ts`          | `upsertProduct()`, `deleteProduct()`, `bulkUpdateProducts()`, `uploadProductImage()`, `upsertCategory()`, `deleteCategory()`, `uploadCategoryImage()`, `reorderSubcategories()`, `upsertBrand()`, `deleteBrand()`, `getBrands()`, `upsertBanner()`, `deleteBanner()`, `uploadBannerImage()`, `reorderBanners()`, `updateOrderStatus()`, `updateOrderItems()`, `updateOrderDelivery()`, `downloadInvoice()`, `resendOrderNotification()`, `setUserRole()` — all gated by `assertAdmin()` and run through a service-role client |

## Auth

- **Provider:** Supabase Auth
- **Methods:** Email/password + Google OAuth
- **Email flow:** sign up → email OTP → `/auth/confirm` route → redirect
- **OAuth flow:** Google PKCE → `/auth/confirm` code exchange
- **Roles:** `app_metadata.role` is `"admin"`, `"superadmin"` or absent — `lib/roles.ts` (`adminRole()`, `isSuperAdmin()`) is the only place that reads it. Both open the admin area; `superadmin` additionally sees `/admin/users` and is the only role that can hand out access. Only the service role can write the key, so nothing a user controls grants either.
- **The super-admin is set by hand in Supabase, never by the app.** `setUserRole()` only ever writes `"admin"` (or deletes the key) and refuses any account that already holds `"superadmin"` — that is what makes the owner's account impossible to demote from the UI. To appoint or move it, in the Supabase SQL editor:

  ```sql
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"superadmin"}'::jsonb
   where email = 'owner@example.com';
  ```

  With no super-admin at all, `/admin/users` 404s for everyone and roles can only be changed with that statement; the rest of the admin keeps working for existing admins.

- **Freshness:** both guards read the role through `auth.getUser()`, which asks the Auth server rather than trusting the access token's claims, so a grant — and more importantly a revocation — applies on the next request rather than at the next token refresh.
- **Server auth:** `createClient()` from `supabase-server.ts` (reads cookies); admin server actions additionally re-check via `assertAdmin()` before using the service-role client, and `setUserRole()` re-reads its _target's_ role there too, so a stale page cannot demote anyone it shouldn't
- **Client sync:** `AuthSync` component listens to `onAuthStateChange` and calls `setUser()` on both the cart and favorites stores
- **Protected routes:** `/admin/*` (401 redirect if not admin), `/admin/users` (`requireSuperAdmin()` — `notFound()` for an ordinary admin, and `AdminNav` hides the tab), `/profile` (redirect to `/auth`)

## Environments

Two independent Supabase projects and two Vercel deployments:

|            | host                               | Supabase ref           | `DEPLOY_ORIGIN`         | indexed |
| ---------- | ---------------------------------- | ---------------------- | ----------------------- | ------- |
| production | `aloe.kg` (branch `main`)          | `ukgtmxzpzprmoutqskgq` | **unset**               | yes     |
| staging    | `stage.aloe.kg` (branch `staging`) | its own project        | `https://stage.aloe.kg` | no      |

Both projects run in **eu-central-1 (Frankfurt)**. Staging is not migrated or repaired when
something goes wrong with it — it is recreated from scratch (`supabase/STAGING-RESET.md`), which
costs half an hour and is also the only thing that exercises the migration chain on an empty
database.

Staging sits behind Vercel Authentication and holds a copy of the production **catalogue only** —
no orders, profiles, favorites or carts. Product photos are the deliberate exception to the
isolation: rows keep their absolute production storage URLs and staging reads the images out of
production's public buckets, because copying 6000+ objects on every reseed buys nothing and nothing
in the app can delete a storage object (`.remove(` appears only in `scripts/prune-orphan-images.mjs`).
Anything uploaded through staging's admin lands in staging's own bucket, so the upload path is still
exercised end to end.

Which file holds what: **`.env.local` → staging** (what `next dev` loads) and **`.env.prod` →
production** (scripts only). `.env.prod` is spelled that way because Next auto-loads
`.env.production` and `.env.production.local`, so production keys under either name would be picked
up by a local `npm run build`. `.env.example` is the committed template.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL        # prod: https://ukgtmxzpzprmoutqskgq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   # public/client-safe
SUPABASE_SERVICE_ROLE_KEY       # server-only, used in admin actions + guest checkout to bypass RLS

SMTP_HOST                       # mail.aloe.kg — order notifications to the admin
SMTP_PORT
SMTP_USER
SMTP_PASS
ADMIN_NOTIFICATION_EMAIL        # recipient; unset → notifications are skipped, not failed.
                                # On staging and locally this MUST be a test inbox — it is the
                                # owner's real address on production.
SMTP_TLS_SERVERNAME             # optional, defaults to mail.hoster.kg (certificate name, see lib/mailer.ts)

DEPLOY_ORIGIN                   # optional; the origin THIS deployment serves on when it is not
                                # SITE_URL (aloe.kg). Unset means "this is the canonical domain",
                                # which is what production wants now that aloe.kg points here —
                                # a leftover value noindexes the live shop.
                                # staging: https://stage.aloe.kg. Read at BUILD time, so changing
                                # it on Vercel needs a redeploy, not a restart.
```

**`SITE_URL` vs `DEPLOY_ORIGIN`:** `SITE_URL` (`lib/constants.ts`, hardcoded `https://aloe.kg`) is
the canonical domain — canonical tags, `metadataBase`, JSON-LD, the sitemap and the legacy-URL 301s
all use it. `DEPLOY_ORIGIN` (`lib/deploy-origin.ts`) is where this build actually answers, and
exists because the two were different during the cutover: the shop ran on `new.aloe.kg` while
`aloe.kg` still served the old JoomShopping store. Anything addressing _this_ deployment rather
than the canonical domain reads it — the admin link in the order notification email
(`lib/mailer.ts`), and the decision whether this host may be indexed at all.

The cutover is done: `aloe.kg` now serves this deployment, so **production leaves `DEPLOY_ORIGIN`
unset** and only preview deployments set it. Whenever the two differ, `app/robots.ts` returns
`Disallow: /` and the root layout adds `noindex` — two signals, because robots.txt alone still
allows a URL-only index entry. That guard has teeth in both directions: a stale `DEPLOY_ORIGIN` on
production silently hides the live shop from search, as it once did. An unset or malformed value
falls back to `SITE_URL` on purpose — a missing variable must not noindex the live shop.

Because `SITE_URL` is compile-time, **canonical tags on staging point at `aloe.kg`**. That is
correct and deliberate — the pages are `noindex` anyway, and a canonical naming the staging host
would be worse. Do not "fix" it.

`SPECIALS_BASE_URL` (also `lib/constants.ts`) is the third URL here and the only one pinned to a
Supabase project rather than a domain: the four fixed `/catalog` tiles live under
`categories/specials/` in production's bucket, which the catalogue seed does not copy. Deriving it
from `NEXT_PUBLIC_SUPABASE_URL` would leave staging with four broken tiles and gain nothing.

The old store stays reachable at `LEGACY_SITE_URL` (`https://old.aloe.kg`), linked from the footer
with `rel="nofollow"`; old JoomShopping product URLs on the main domain are 301d to `/product/[id]`
by `app/catalog/product/view/[...path]/route.ts`. Those redirects send a **relative** `Location`
(`lib/legacy-redirect.ts`, `proxy.ts`), so they land on whichever host was asked — production,
staging or localhost. An absolute one would be wrong either way: built from `SITE_URL` it bounces
staging traffic into the live shop, and built from the request it bakes the first caller's host into
a response the route caches for a day (`revalidate = 86400`).

## Key Patterns

**No `/api` routes** — all data access via Supabase directly or Server Actions.

**Data fetching strategy:**

- RSC + `unstable_cache()` for static/semi-static data (categories, brands, banners, carousels)
- React `cache()` for per-request deduplication
- `Promise.all()` for parallel queries
- Dynamic product/order pages: no caching (fresh per request)
- Brand pages use `IntersectionObserver`-driven infinite scroll (`BrandProductsInfinite`) backed by a cached, paginated server action; the page size is a constant (`app/brands/[brand]/pagination.ts`) rather than a prop the client sends back, because the action's arguments become a cache key — see "Cache budget"

**Admin mutations** always use a service-role client (bypasses RLS) and are gated by an `assertAdmin()` check inside the action itself (not just route-level middleware). User mutations use the anon client scoped by RLS to `auth.uid()`.

**Category page virtual scroll:** `/catalog/[slug]` renders all subcategory sections on one page using `VirtualCategoryContent` (`@tanstack/react-virtual` window virtualizer). `SubcategoryFilter` shows pills that jump to sections. The two are decoupled via module-level singletons: `lib/section-scroll.ts` (imperative scroll command) and `lib/active-section.ts` (pub/sub for the visible section id) — no shared React state or prop drilling needed.

**`ProductCard` is `React.memo`-wrapped:** it renders inside the virtualized category grid, carousels, and infinite-scroll brand pages, whose parents re-render on every scroll tick / page load — memoizing avoids re-rendering every visible card (and its `AddToCart`/`FavoriteButton` children) when its own props haven't changed.

**The search brand facet is ids, not rows.** `getBrandIdsForSearch()` selects only `brand_id` from
the matching products and `SearchResults` intersects those ids with `getCachedBrands()`, which is
cached for an hour and already ordered by name — so a broad search no longer carries a
`brands(id, name)` join on every page of matches. The scan is capped at five pages of 1000: a flat
`.limit(1000)` silently dropped every brand whose products sorted past the first thousand, and the
filter had no way to reach them. Past five pages the facet is approximate, which is the trade a full
scan on an unrated public route cannot justify.

**Admin product filters** carry two `none` sentinels rather than only real values: `?label=none`
finds products with no badge, and `?category=none` finds products whose `category_id` is missing —
rows orphaned by the category FK's old `ON DELETE SET NULL`, which nothing else in the admin could
single out. The list also badges them, since `products_published_has_category` means such a product
cannot be published at all.

**Editing a placed order** is the one path where the client decides prices. `updateOrderItems()`
takes the name and price of each line from the admin — correcting what the catalogue says is the
point — so `assertAdmin()` is all that stands between a crafted request and an arbitrary total, and
`validateOrderItems()` caps every field rather than merely type-checking it. A zero price is
accepted here and rejected at checkout: there the catalogue supplies it, so zero means a broken row.
`updateOrderDelivery()` changes the zone and its fee separately, because "regions" has no computable
fee at all — it is agreed by phone. Nothing in the schema records that a fee was typed rather than
derived, so `isManualDeliveryCost()` infers it by asking whether the stored fee is what the tariff
would have charged the _previous_ basket; without it, editing the items of a regions order would
wipe the negotiated fee back to 0. The blind spot is a manual fee equal to the tariff, which
recomputes to itself.

**WhatsApp is a link, not an integration.** Each row in the admin order list carries a `wa.me`
link to the customer's chat with a message for the order's current status already typed in
(`lib/whatsapp.ts`) — the admin presses send, and edits the text first if the order needs it.
Going further, to the WhatsApp Business API, would mean registering `WHATSAPP_NUMBER` with Meta,
and a number registered there **stops working in the regular WhatsApp app**: that one number is the
shop's only channel, carrying consultations, wallet payment confirmations and the regions delivery
quote, all by hand. Automated status messages would therefore cost a second number, business
verification, a Meta-approved template per status and a per-message fee — so this stops at the link
until the volume argues otherwise.

The invoice cannot ride along in that link — no URL parameter attaches a file — so
`ShareInvoiceButton` hands the PDF to the phone's share sheet via `navigator.share({ files })`
instead, with WhatsApp as one of its targets. It renders only where sharing leads anywhere, which takes
two checks: the browser must accept files — probed with a real `File` rather than guessed from the
user agent, because desktop Chrome exposes `navigator.share` and then refuses them — and the
primary pointer must be coarse, because macOS answers that probe with `true` and then opens a sheet
with no WhatsApp in it. On a desktop the existing download button is the answer. The PDF is fetched before the sheet opens, which spends Safari's user activation, so a
first tap that comes back empty keeps the document and asks for a second one. It is held against a
revision string built from the order's items and fees, so an edit in either editor drops it rather
than sharing a superseded invoice.

`customer_phone` is free text (checkout only requires nine digits somewhere in it), so
`toWhatsAppNumber()` normalises `+996 555 …`, `0505 008 085`, `709 272 740` and the Soviet-era
`8 505 …` trunk form to the bare international digits
`wa.me` wants — the same spread `customerKey()` reconciles for analytics. It returns null rather
than guessing at anything else, and the row then shows the phone as plain text: a wrong number here
opens a chat with a stranger and puts a customer's order details into it.

**Admin analytics** (`/admin/analytics`) is computed in JS, not in SQL. `analytics.service.ts`
pulls the orders of the period _and the one before it_ in a single paged fetch (PostgREST caps a
request at 1000 rows), a four-column scan of the whole order history, the whole catalogue (~3
narrow requests) and the favorites table. Two pure modules turn that into the page:
`lib/analytics.ts` builds the core report — revenue split into goods and delivery, a bucketed time
series, top products, delivery zones, statuses, new-vs-returning customers, and the previous
period's summary for the tiles' deltas — and `lib/analytics-insights.ts` everything that needs the
catalogue or the history: categories, brands, a weekday × hour heatmap, promo share, the
free-delivery threshold histogram, cancellations, repeat purchases, favorites against sales and
products with no sale. An RPC would be faster but would put a migration
between the shop and every change to a formula, and this way the arithmetic is exercised by
`tests/analytics.test.ts` with no database at all. The fetch is capped at `MAX_ANALYTICS_ORDERS`
(10 000) and the page says so when it hits the cap rather than quietly under-reporting; that cap is
the signal to move the aggregation into Postgres.

Three things there are deliberate. **Days are Bishkek days** — `created_at` is timestamptz, and
bucketing in UTC moves every order placed after 18:00 local into tomorrow. **A customer is a phone
number, not an account** (last 9 digits, so `+996 555 …` and `0555 …` are one person): the same
buyer orders once as a guest and once signed in, and `user_id` alone would count them twice and
call both "новый". **A zero `delivery_cost` only counts as free delivery for the two city zones** —
"regions" is agreed by phone and "urgent" is paid to the courier, so neither says anything about
the free-delivery threshold, the same distinction `deliveryFreeNote()` makes. Cancelled orders are
out of the money by default (a checkbox puts them back) but always present in the status breakdown
and the cancellation card, which is what those are for.

The insights carry their own compromises, each stated on its card rather than hidden:

- **Category, brand and promo are read from the catalogue as it is now.** `orders.items` freezes a
  line's name and price and nothing else, so a re-categorised product counts where it sits today,
  and "акционный" means the product has the `sale` label or an `old_price` above its price _now_.
- **Favorites are a snapshot.** Removing a heart deletes the row, so the card compares today's
  wishlist with the period's sales, and only signed-in customers have one.
- **The threshold histogram covers only the zones where the threshold waives the fee**
  (`freeOverThreshold`, i.e. центр). Elsewhere a basket's size says nothing about whether the
  threshold moved it.
- **A product needs two orders before it can top the cancellation list** — one cancelled order is
  an anecdote at 100%.
- **"Без продаж" ignores products added during the period**, which never had the whole window to sell.
- **The previous-period comparison is dropped when the fetch is truncated** — the cap cuts the
  oldest rows first, which are exactly the previous period's, and a partial baseline would show
  growth that is not there.

The heatmap's green steps start at green-500, not a pale tint: checked with the dataviz palette
validator, anything lighter falls under 2:1 against the white card. Changing a filter runs inside a
transition — the report dims under a loader centred in the viewport and the filters are disabled
until it lands, because `loading.tsx` only covers entering the route, not a search-param change.

**Admin list pages** (products/categories/brands/orders) share `useAdminListNav()` (syncs filters to the URL query string, resets pagination on filter change) and `useDebouncedSearch()` (debounces search input before triggering navigation).

**Drag-to-reorder** for admin categories and banners shares one hook, `useDragReorder()` — tracks drag/drop indices per group and hands back a reordered array; the caller persists the new `sort_order` via a server action (`reorderSubcategories()` / `reorderBanners()`).

**One sheet component.** `components/Sheet.tsx` is the bottom sheet on a phone and the centred dialog from `md` up, with the scroll lock, focus trap, `Esc` handling and the enter/exit animation in one place; `ProductModal` and `AuthModal` are thin wrappers over it. Mounted means open — the panel animates in on mount and out through its own `close()`, and `onClose` runs only after the exit, which is what lets the quick view defer `router.back()` until the sheet is off screen. `requestClose` is for dismissing it from outside (the sign-in sheet closes itself once the session lands) rather than unmounting it mid-animation. It transitions `translate`/`scale`, **not** `transform`: Tailwind 4 compiles those utilities to the standalone CSS properties, so a `transition-[transform,…]` names a property nothing animates and the sheet appears without moving.

**The sign-in form is shared, not duplicated.** `app/auth/AuthForm.tsx` holds the login/register/reset form with no page chrome; `/auth` wraps it in `MainContainer` and supplies the confirmation banners (it owns the `useSearchParams` read, so the form can be used where there is no Suspense boundary), and `AuthModal` wraps it in a sheet, passes `onAuthenticated` so a successful sign-in closes the sheet instead of pushing to `/`, and loads it with `next/dynamic` — it is mounted in the root layout on every page but only ever opened by a guest.

**Product quick-view modal:** `ProductCard` links to `/product/[id]` normally; the `@modal` parallel route (`app/@modal/(.)product/[id]/page.tsx`) intercepts that soft navigation and renders it inside `ProductModal` instead, so browsing stays on the originating grid/carousel while the URL still updates. See "Quick-view modal" note under App Routes.

**Cache budget (Vercel Hobby).** The plan meters 200K ISR writes a month, and a write is charged
both for regenerating an ISR page and for filling a Data Cache entry — `unstable_cache` included.
That is the only metric this project has come close to (174K in a 30-day window; nothing else was
above ~35%), and the cause was never traffic, it was key cardinality times expiry rate. A single
product view that finds everything stale costs three writes: the `/product/[id]` ISR entry,
`getCachedProduct(id)`, and `getCachedRelatedProducts(...)`. So four things are load-bearing and
should be weighed before any of them is changed:

- **`revalidate` on `/product/[id]` tracks `CATALOGUE_TTL`.** Both are 10 min, so the page and the
  data it reads expire together — a shorter page TTL just rebuilds a page around unchanged data.
- **A cache key must not carry anything per-product that the query does not need.** `excludeId` on
  related products was the whole difference between ~90 entries and 2400.
- **A public server action's arguments are a cache key an anonymous caller writes.**
  `loadMoreBrandProducts` took `pageSize` and passed it straight into `getCachedProductsByBrand`:
  clamping it to 1..48 bounded each response but not the number of keys, so the 48 × 10 000 grid was
  up to 480 000 mintable entries per brand. It is now `BRAND_PAGE_SIZE` in
  `app/brands/[brand]/pagination.ts`, shared by the page, the client and the action, and the key is
  `(brandId, page)`; `BRAND_MAX_PAGE` (200) bounds the rest.
- **A page past the end is a 404, not an empty 200.** `LabelProductsPage` and `SearchResults` call
  `notFound()` when `page > 1` comes back empty, and `MAX_PAGE` (`lib/page-params.ts`) is 500 —
  otherwise anyone could mint an ISR and a Data Cache entry per `?page=`, each one indexable.
- **A filter runs on the cached result, not in the cached query.** Sorting and the price range never
  enter a cache key: `/catalog/[slug]` gets the whole category in one entry and narrows it with
  `lib/price-filter.ts`, on the server for the first render and on the client for every interaction
  after it. `/search` is the exception and filters in SQL, because it is not cached at all and its
  `COUNT` is what decides how many pages exist. **An empty filter result is a 200, not a 404** — the
  `notFound()` on `/catalog/[slug]` is decided on the unfiltered sections, since a price range
  matching nothing is not a missing category.

None of it costs freshness, because tag invalidation, not the TTL, is what publishes an admin edit.

**Image optimization is intentionally disabled** — `next.config.ts` sets `images.unoptimized: true` (Vercel Hobby plan quota on Image Optimization source images). Do not re-enable without checking the plan/hosting situation first. Because nothing resizes at request time, **the browser downloads exactly the bytes that were uploaded**, so every product photo is stored at two sizes instead:

| column          | size    | rendered by                                                                        |
| --------------- | ------- | ---------------------------------------------------------------------------------- |
| `thumbnail_url` | ≤ 500px | `ProductCard` (grids, carousels, brand pages), cart rows, autocomplete, admin list |
| `image_url`     | ≤1200px | `/product/[id]`, the quick-view modal, OG/JSON-LD metadata, order snapshots        |

Both are WebP (q76 / q82). `uploadProductImage()` produces the pair with `sharp` from a single admin upload — it stores `thumb/<name>.webp` alongside `<name>.webp` and returns both URLs, so the two columns are always written together. Consumers read `thumbnail_url || image_url`; the fallback covers rows predating the backfill. Because uploads are re-encoded server-side, the action accepts originals up to 15 MB, which is also why `experimental.serverActions.bodySizeLimit` is raised — the 1 MB default rejected phone photos before the action ever ran.

Banners are re-encoded the same way: `uploadBannerImage(formData, type)` takes the `desktop`/`mobile`
tab it was uploaded from and writes a single WebP — ≤1600px q82 for desktop, ≤1000px q80 for mobile —
because the homepage renders the two sets as separate carousels, so neither file has to cover the
other's breakpoint. Category images are still stored as uploaded (`uploadImage()`).

**Which banner the browser actually fetches** is decided by `<picture>`, not by CSS. The homepage
keeps both carousels in the DOM and hides one with `display:none`, and a hidden `<img>` is still
downloaded — `loading="lazy"` can only defer an image the browser can place relative to the
viewport, and one without a box never qualifies. So `BannerCarousel` scopes each image to its own
breakpoint with `<source media>` and gives the `<img>` an inline transparent pixel as its fallback
`src`: the other breakpoint downloads 43 bytes instead of a banner. The first slide is `eager` +
`fetchpriority="high"` rather than preloaded, because a `<link rel=preload>` ignores media and
would fetch both sets again — the case next/image's own docs send to `fetchPriority`.

For the same reason **no card in a `ProductCarousel` is preloaded**: the homepage stacks fourteen
of them, and `preload` on the first card of each put fourteen `<link rel=preload>`s in front of the
stylesheet, the JS chunks and the LCP banner. Grids elsewhere still preload their first card —
there the card is the LCP element. (`preload` is what Next 16 renamed `priority` to.)

**Legacy URLs from the old shop** are redirected in two places, split by whether the mapping can be
computed or has to be looked up. The old sitemap (still submitted to Search Console from 2017)
listed 2879 addresses, and until this was in place every one of them answered 404 on the new site:

| shape                                                                                 | count | handled by                                |
| ------------------------------------------------------------------------------------- | ----- | ----------------------------------------- |
| `/catalog/<slug>/product/view/<cat>/<id>.html`                                        | 2415  | route handler → `redirectLegacyProduct()` |
| `/brendy/manufacturer/view/<id>.html`                                                 | 384   | `proxy.ts` + `legacy-redirects.ts`        |
| `/catalog/<slug>/category/view/<id>.html`                                             | 62    | same                                      |
| `/catalog/<slug>.html`, `/catalog.html`, `/brendy.html`, `/oplata-i-dostavka.html`, … | 18    | same                                      |

Products carry their old address in `products.product_url`, so they resolve per request against the
database and stay correct as the catalogue changes — but only on the
`/product/view/<cat>/<id>.html` **tail**: JoomShopping published each product both with and without
a category segment, `product_url` recorded only the shorter form, and the longer one is what the
sitemap submitted and Google indexed. Everything else has no such column, so
`scripts/build-legacy-redirects.mjs` reads the old site once, matches its `<h1>` against `brands` /
`categories`, and writes `lib/legacy-redirects.ts`; `proxy.ts` then answers from that map with no
database round trip. Old JoomShopping ids never change, so the map is frozen history — regenerate it
only if the old sitemap itself changes.

`LEGACY_PERMANENT` is a 301 (an exact counterpart exists); `LEGACY_FALLBACK` is a 302 to the nearest
listing, for the 193 brands this catalogue no longer carries and the three top-level categories the
reorganisation dissolved ("Бытовая химия" split into Для стирки + Для уборки). The 302 matters: it
keeps a URL from being permanently tied to a page it never had, so a brand that is stocked again can
reclaim its own address. The same reasoning applies to an unpublished product in
`redirectLegacyProduct()`.

**Security headers live in `next.config.ts` `headers()`, not in `proxy.ts`.** Headers are matched
before the filesystem and before the proxy, so one `/:path*` rule also covers `/_next/static`,
`/public` and the metadata routes — every one of which the proxy's matcher deliberately excludes —
and it costs no function invocation. The proxy would have needed the same block on each of its three
early returns, including the anonymous-visitor fast path that is most of the storefront's traffic.
A second rule sets `Referrer-Policy: no-referrer` on `/auth/:path*`, because `/auth/confirm` reads
`token_hash` and `code` out of the query string; where two rules set the same key, the last wins.

`Strict-Transport-Security` is **deliberately absent**: Vercel already sends it on `aloe.kg`, and
adding `includeSubDomains` would make `https://mail.aloe.kg` permanently unopenable — that host
presents a `*.hoster.kg` certificate (`lib/mailer.ts`), and HSTS turns a name mismatch into an error
no browser lets you click through.

The CSP itself is built by `lib/csp.ts` and is **baked in at build time**, like `DEPLOY_ORIGIN`:
changing `NEXT_PUBLIC_SUPABASE_URL` on Vercel needs a redeploy, not a restart. It is derived from
that variable rather than hardcoded because production and staging are different Supabase projects,
and `img-src` additionally names production's storage origin unconditionally, since staging reads
product photos and the four `/catalog` tiles out of production's public buckets. A missing variable
**fails the production build** — the opposite of `DEPLOY_ORIGIN`'s fallback, because here a wrong
default would block the API the whole shop runs on rather than merely noindexing it.

`script-src` is `'self' 'unsafe-inline'` rather than nonce-based on purpose. A nonce is applied at
render time, so it cannot match the inline RSC payload baked into a prerendered page — every route
would have to go dynamic, trading CDN-served HTML for a serverless render per view (see "Cache
budget" above). `'self'` still blocks injection of an external script, and the only inline script
this app generates from data, `components/JsonLd.tsx`, escapes its input. `style-src` needs
`'unsafe-inline'` regardless: `nextjs-toploader` renders a real inline `<style>`, and `style={{…}}`
props become style _attributes_, which nonces do not cover.

It shipped as `Content-Security-Policy-Report-Only` and is now enforcing — one constant,
`CSP_HEADER`, switches between the two. There is deliberately no `report-uri`: that would be an
unauthenticated public POST endpoint fed a steady stream of junk from browser extensions.

The one thing enforcing changes for content: `img-src` allows `'self'` and the two Supabase
origins, so an image hotlinked from a third-party host inside a Markdown product description no
longer renders. Nine products inherited such images from the old JoomShopping descriptions and half
of those URLs are already dead; the answer is to fix those rows, not to widen the policy.

**Page metadata:** every indexable page builds its metadata with `pageMetadata()` (`lib/seo.ts`)
rather than writing the fields out, because Next merges `openGraph` with the root layout's instead
of deriving it from the page's own `title`/`description` — a page that omits the block silently
advertises the home page's name and URL in every WhatsApp/Telegram preview. Product pages are the
exception that proves the rule: they pass `title: { absolute: ... }` to skip the root
`"%s — Aloe.kg"` template, whose suffix would otherwise land on a title that already ends in
`| Aloe.kg`. Paginated pages (`/new`, `/sale`, `/popular`) point the canonical at `?page=N` itself,
not at page 1 — page 2 is not a duplicate of page 1, it is different products.

**Product Offer markup** carries `shippingDetails` and `hasMerchantReturnPolicy` (`lib/seo.ts`),
which is what Search Console's merchant-listing report asks an Offer for. Both are derived from
`lib/constants.ts` so the markup cannot drift from what checkout charges. Shipping is a **single**
`OfferShippingDetails` at the highest city rate: `DefinedRegion` cannot name a Bishkek microdistrict,
so the 200/300 zones would both come out addressed to "Бишкек" and read as a duplicate rather than a
choice — and overstating the rate can only surprise a customer in their favour. "regions" and
"urgent" are excluded because neither has a rate to state.

The return policy is a **placeholder**: no one has stated the shop's real terms, so
`RETURN_WINDOW_DAYS` is the legal default (14 days, return shipping on the buyer) and is published
both in the markup and in the "Возврат товара" section of `DeliveryContent` — replace all of it once
the owner answers. Two of the five reported issues are deliberately left open: `review` and
`aggregateRating` have no source of truth here, and inventing them breaks Google's policy. "No global
identifier" is a data gap, not a code one — 413 of 2403 published products have no `brand_id`, and
the schema has no GTIN column.

**Primary color:** `#16a34a` (green-600) — `BRAND_COLOR` in `lib/constants.ts`, used by the manifest, the `viewport` export and `NextTopLoader`.

**PWA — installable only, no service worker.** `app/manifest.ts` plus the `viewport` export and
`appleWebApp` in `app/layout.tsx` make the storefront installable and give it a proper standalone
look; `scripts/generate-app-icons.mjs` regenerates `public/icon-192.png`, `public/icon-512.png` and
`public/icon-maskable-512.png` from `app/icon.svg` (the maskable one is inset to 60% for Android's
launcher mask). There is deliberately **no service worker and no offline cache**: prices and stock
must not be served stale, `createOrder` is not idempotent so a background-sync retry would duplicate
orders, and Serwist — the offline route the Next guide points at — still requires webpack while this
project builds with Turbopack. `themeColor` lives in `viewport`, not `metadata`, where Next has
deprecated it since v14.

`components/InstallAppIos.tsx` tells an iPhone visitor how to install it, on `/auth`, `/profile`,
in the sign-in sheet and after a completed order. The two sign-in surfaces earn it for a reason
the card does not state: an installed iOS web app gets its own storage container, separate from
Safari's, so a session started in the browser does not follow it in, and installing first means
signing in once rather than twice. That is worth knowing here and not worth explaining to a
customer, so the copy is the same everywhere it appears. iOS is handled alone because it has no install API at all — Safari offers
nothing to call, so a site can only describe the share sheet, while Android fires
`beforeinstallprompt` and wants a button instead. It is also the one component that reads the user
agent, for the same reason: "show the iOS steps" is not a capability a browser can be asked about.
iPadOS reports itself as a Macintosh, so `maxTouchPoints` separates an iPad from a Mac, and the
other iOS browsers are excluded because their "Добавить на экран «Домой»" is not where these steps
say to look — an in-app Instagram browser has none at all.

Because `viewport` sets `viewport-fit: cover`, `app/globals.css` carries the matching safe-area
insets: left/right on `body`, and the `safe-area-pb` utility that `MobileBottomNav` uses to stay
clear of the iPhone home indicator in standalone.

**Vercel measurement — `<SpeedInsights />` and `<Analytics />`, both in `app/layout.tsx`.** Speed
Insights reports Core Web Vitals from real visits; Web Analytics reports page views, referrers,
geography and devices. Neither sets a cookie or stores an identity — a visitor is a daily rotating
hash of IP + user agent — so no consent banner is required, and both talk to a same-origin
`/_vercel/…` path in production, which is why the CSP needs nothing beyond `'self'` there (`lib/csp.ts`
allows `va.vercel-scripts.com` in dev only, where both load a debug script instead).

What Analytics can answer is set by the plan, not by the code: Hobby meters **events**, one per page
view, and keeps 30 days; `track()` custom events are Pro-only. So there is deliberately no
add-to-cart / checkout instrumentation — that funnel already exists exactly and permanently in
Supabase `orders` and `purchase_count`, and duplicating it into a 30-day sampled counter would be
worse data in a second place. This is a separate meter from the ISR writes in “Cache budget” above;
the two do not draw on each other.

## Scripts

```bash
npm run dev         # start dev server
npm run build       # production build
npm run start       # start production server
npm run lint        # ESLint
npm run format      # Prettier write
npm run format:check
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
npm run db:types    # regenerate types/database.ts from the LINKED project (prints which, to stderr)
```

### Environment-aware commands

```bash
npm run db:linked       # which Supabase project the CLI is linked to right now
npm run db:link:prod    # relink to production (do this when you finish with staging)
npm run db:link:stage   # relink to staging — ref read from .env.local
npm run db:push:stage   # link + apply supabase/migrations/ to staging
npm run db:push:prod    # link + apply to production
npm run db:types:prod   # the ONLY correct way to regenerate types/database.ts
npm run backup:prod     # dump production into backups/<timestamp>-prod/
npm run seed:stage      # dry-run the catalogue seed; --execute writes
npm run seed:stage:orders  # dry-run mock accounts + orders on staging; --execute writes, --reset replaces
```

### Schema changes

```bash
npm run db:push:stage                   # rehearse on staging first
npm run db:push:prod                    # then production
npm run db:types:prod && npm run typecheck
```

`types/database.ts` is committed and must describe the schema **production** runs, which is why it
is regenerated with `db:types:prod` and not bare `db:types` — the latter reads whichever project the
CLI is linked to, recorded in the untracked `supabase/.temp/project-ref`.

### Maintenance scripts

The catalogue used to be pulled from the old JoomShopping store by a set of scripts under
`scripts/joomla/`. They were removed once the cutover made `old.aloe.kg` an archive: the catalogue
is now edited in this admin, so a sync could only overwrite it. They remain in the git history if
the old store ever has to be read again. `npm run backup:prod` first is still the rule for anything
below that writes.

```bash
node scripts/normalize-product-images.mjs --env=prod   # row not yet a WebP pair → build it from Storage
node scripts/prune-orphan-images.mjs --env=prod        # bucket objects nothing references (--execute deletes)
node scripts/fix-orphan-categories.mjs --env=prod      # products whose category_id was stripped
node scripts/purge-test-data.mjs --env=prod            # pre-launch orders/accounts/counters
node scripts/seed-staging.mjs --env=stage              # production catalogue → staging (no personal data)
node scripts/seed-staging-orders.mjs --env=stage       # made-up accounts + orders on staging, for the admin
node scripts/generate-app-icons.mjs                    # app/icon.svg → the manifest's PNG icons
node scripts/build-legacy-redirects.mjs --env=prod     # old site's URLs → lib/legacy-redirects.ts
node scripts/set-user-password.mjs --env=prod --email=…  # reset an account's password (see below)
```

**Every script that opens the database requires `--env=prod` or `--env=stage`, with no default** —
the right default differs per script, so there isn't one. `scripts/lib/target.mjs` loads `.env.prod`
or `.env.local` accordingly, re-derives the project ref from the URL it actually read rather than
trusting the file name, and refuses the mismatches (`--env=stage` against a file pointing at
production, and the reverse). Destructive scripts additionally need `--i-know-this-is-production`
before `--execute` may write to production. Every run announces the target on stderr.

That guard exists for `prune-orphan-images.mjs` specifically: it subtracts what `products`
references from what the bucket holds and deletes the rest, so a database and a bucket belonging to
different projects make every object look orphaned. It is the only irreversible action in the repo,
and storage is not covered by the backups. Both it and `normalize-product-images.mjs` now build
their storage prefix from the same URL the client opened, so the rows and the bucket cannot name
different projects.

`normalize-product-images.mjs` is the one to run after a bulk import or whenever
`image_url`/`thumbnail_url` disagree; it leaves existing WebP rows alone so nothing is re-encoded
twice. `purge-test-data.mjs` clears pre-launch test data, and exists because three things are coupled:
`purchase_count` does not follow the order it came from (checkout increments it via the RPC, so
deleting the order would leave `/popular` ranked by test purchases — `--reset-counts` recomputes
from the orders that remain), `orders.user_id` cascades (see the FK migration below), and
`backups/backup-db.mjs` is the only copy of an order that exists anywhere, so the script refuses to
delete without a dump containing `orders.json`. Nothing is selected by pattern: orders go by id,
accounts by email, and an account with `role=admin` is never deleted.

`backups/backup-db.mjs` covers `orders`, `profiles`, `favorites`, `cart_items`, `brands` and
`banners` as well as the catalogue — the catalogue can be re-pulled from the old site, an order
cannot. The dump includes customer names, phones and addresses; the dumps are git-ignored (the
script itself is not). The directory is named `<timestamp>-<env>`, because a staging dump and a
production dump are otherwise indistinguishable and `seed-staging.mjs` picks the newest `-prod` one.

`seed-staging.mjs` loads four tables of such a dump — `categories`, `brands`, `banners`, `products`
— into staging and never the other four, which are personal data. Ids are preserved (storage objects
are named `<product-id>.webp`, `product_url` feeds the legacy 301s), categories go in parent-first
because `parent_id` is a non-deferrable self-FK, and the script prints a `setval` block to run in the
SQL Editor afterwards — writing explicit ids does not advance the sequences, and nothing looks wrong
until the first insert from the admin collides.

`seed-staging-orders.mjs` fills the gap that leaves: a catalogue-only staging has no orders, so
`/admin/analytics` and `/admin/orders` are empty there. It invents customers (accounts
`mock-NN@mock.aloe.kg`, confirmed, one shared password printed once) and orders against the real
staging catalogue — repeat buyers, guests, both phone spellings, every zone and status, a few
favorites per account (they cascade away with the account on `--reset`) — and raises
`purchase_count` through the same RPC checkout uses. It is seeded (`--seed`), so a dry run shows
exactly what `--execute` writes, and refuses to run twice without `--reset`, which would double every
number. Unlike `purge-test-data.mjs` it selects by marker — `comment` starting `[mock]`, the
`@mock.aloe.kg` domain — because it only ever removes what it wrote, and it cannot open production.
`--reset` also takes back exactly the `purchase_count` the mock orders added.

`set-user-password.mjs` is the only way back into the admin if a password is lost. The dashboard's
"send password recovery" link is a dead end here — `app/auth/confirm/route.ts` verifies the recovery
token and signs the session straight out again, there is no page to set a new password on, and the
sign-in form offers no "forgot password" link. The script reads the new password from the terminal
with echo off (or `--generate`s one) rather than taking it as an argument, where `ps` and the shell
history would both keep it, and `--revoke-sessions` additionally invalidates cookies issued under
the old one.

`fix-orphan-categories.mjs` cleans up after the category FK's old `ON DELETE SET NULL`: 91 products
lost their `category_id` when a category was deleted and keep only the denormalised `category`
label, which the tree reorganisation renamed. It matches that label to a leaf category ignoring
case, ё/е and punctuation, takes judgement calls from an `OVERRIDES` table in the file, and reports
the rest with candidates rather than guessing. `prune-orphan-images.mjs` checks `orders.items` as well as both product columns, because an
order freezes its line items' image URLs and those files must outlive the product. It also holds
back admin-uploaded originals (`<epoch-ms>-<rand>.<ext>`) unless `--originals` is passed —
normalizing a product leaves its original unreferenced, but that file is the only high-quality
source left for re-encoding it.

Two facts about the catalogue outlive that sync. The category tree **does not map 1:1 to the old
store's** — it was reorganized wholesale during the migration, which is why `fix-orphan-categories.mjs`
matches on the denormalised `category` label rather than on anything the old site supplied. And a
product **without an `external_id`** was created in this admin and never existed there at all.
