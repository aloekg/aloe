# Aloe.kg — Project Reference

## Tech Stack

- **Framework:** Next.js 16.2.9 (App Router, Server Components, Server Actions, React 19)
- **Language:** TypeScript 6.0.3 (strict mode, path alias `@/*` → root)
- **Database:** Supabase (PostgreSQL + Auth + Storage + RLS)
- **State:** Zustand 5.0.14 (cart and favorites use `persist`/localStorage; toast/mobile-menu don't — both cart and favorites also rehydrate from Supabase on auth)
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
├── store/                  # Zustand stores (cart, favorites, toast, mobile-menu)
├── types/                  # TypeScript type definitions (index.ts) + generated database.ts
├── tests/                  # Vitest unit tests (pure helpers only — no DB, no DOM)
├── supabase/               # migrations/ (source of truth for the schema), sql/audit-rls.sql
├── public/                 # Manifest PNG icons (generated, see scripts/generate-app-icons.mjs)
├── scripts/                # Old-site sync + image maintenance (see below)
├── proxy.ts                # Middleware — Supabase auth cookie management
├── next.config.ts          # Image optimization disabled (unoptimized: true), devIndicators off
├── MIGRATION.md            # Domain cutover: what shipped, what is still open
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

**Quick-view modal:** `/product/[id]` also renders as a modal overlay via a parallel route — `app/@modal/(.)product/[id]/page.tsx` intercepts client-side navigation from `ProductCard`'s `<Link>` and renders `components/ProductModal.tsx` (closes on `Esc`/backdrop click via `router.back()`). A direct/hard navigation still renders the full `/product/[id]` page. `app/@modal/default.tsx` renders `null` when no intercept matches.

**Category page (`/catalog/[slug]`):** renders every subcategory of the top-level category as its own section in one `VirtualCategoryContent` window-virtualized scroll (`@tanstack/react-virtual`). `SubcategoryFilter` renders a pill per subcategory; clicking one calls `scrollToSection` (`lib/section-scroll.ts`) to jump to it, and the pill that's currently scrolled into view is tracked via `lib/active-section.ts` pub/sub and highlighted (`useActiveSectionSync`). As the active section changes, `SubcategoryFilter` mirrors it into the URL as `?sub=<subcategorySlug>` via `history.replaceState` directly (not `router.replace`) so the address bar stays shareable/bookmarkable without forcing a server re-render on every scroll tick. Landing on `/catalog/[slug]?sub=<slug>` (a shared link, a reload, or the breadcrumb/sitemap links below) resolves that slug to a subcategory id server-side and passes it to `VirtualCategoryContent` as `initialSectionId`, which scrolls to it on mount — reasserting the scroll position for the first ~20 frames to win a race against the App Router's own post-navigation scroll handling, which otherwise snaps it back to the top a couple of frames after mount.

**Sub-subcategories (3rd level):** `categories.parent_id` is self-referential, so a category can be nested one level deeper than a normal subcategory (category → subcategory → sub-subcategory). Sub-subcategories have **no page of their own** — `products.category_id` may point directly at one (instead of at the subcategory), and `/catalog/[slug]` groups that subcategory's products into per-sub-subcategory sections within its section rather than routing to a new URL. `getCategoryProducts` (cached as `getCachedCategoryProducts`) takes every category id under the top-level one in one query and returns the rows bucketed by `category_id`, so products assigned at either level arrive together; `buildCategorySection()` in `lib/subcategory-sections.ts` then splits each subcategory's bucket into per-sub-subcategory groups. `sitemap.ts`, the homepage carousel grouping (`app/page.tsx`), and the product-detail breadcrumbs (`app/product/[id]/page.tsx`) all walk up to 2 `parent_id` hops to resolve the real top-level/subcategory pair, and link to the subcategory as `/catalog/[topSlug]?sub=[subSlug]`. Admin: `AdminCategories.tsx` renders 3 tiers and only allows a subcategory (not a sub-subcategory) as a parent, capping the tree at 3 levels; the product editor's category `<select>` only lists leaf categories (those with no children), labeled with their full breadcrumb path.

## Database Schema (Supabase / PostgreSQL)

The schema lives in `supabase/migrations/` and is applied with `npx supabase db push`; `types/database.ts`
is generated from it (`npm run db:types`) and committed. See [supabase/README.md](supabase/README.md)
for the migration list and the recorded RLS audit.

`products.category_id` and `category` are nullable on purpose: 91 products were orphaned by the
category FK's old `ON DELETE SET NULL` and have no category until an admin assigns one. The
invariant the storefront relies on is narrower and lives in a CHECK instead — a **published**
product must be categorised (`products_published_has_category`) — and the FK is now
`ON DELETE RESTRICT`.

### products

| column         | type        | notes                                                                                                            |
| -------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- |
| id             | int         | PK                                                                                                               |
| external_id    | text        | JoomShopping `product_id` on the old site — the join key for the sync scripts (not in `Product` or the admin UI) |
| name           | text        |                                                                                                                  |
| price          | numeric     |                                                                                                                  |
| old_price      | numeric     | nullable                                                                                                         |
| image_url      | text        | large variant (≤1200px WebP) — detail page & modal                                                               |
| thumbnail_url  | text        | nullable — small variant (≤500px WebP) for cards; fall back to `image_url`                                       |
| product_url    | text        | unused — dropped from `Product` type & admin UI                                                                  |
| category       | text        | string label                                                                                                     |
| category_id    | int         | FK → categories.id                                                                                               |
| label          | text        | `new` \| `sale` \| null                                                                                          |
| description    | text        | nullable                                                                                                         |
| brand_id       | int         | FK → brands.id                                                                                                   |
| seo_text       | text        | nullable                                                                                                         |
| purchase_count | int         | incremented on checkout; drives "popular" ranking                                                                |
| published      | boolean     |                                                                                                                  |
| created_at     | timestamptz |                                                                                                                  |

### categories

| column     | type | notes                                                                                                                                       |
| ---------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| id         | int  | PK                                                                                                                                          |
| name       | text |                                                                                                                                             |
| slug       | text |                                                                                                                                             |
| parent_id  | int  | self-referential FK (null = top-level); up to 3 levels deep (category → subcategory → sub-subcategory) — see "Sub-subcategories" note above |
| image_url  | text | nullable                                                                                                                                    |
| sort_order | int  | manual ordering, editable via admin drag-reorder                                                                                            |

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

| column           | type        | notes                                                              |
| ---------------- | ----------- | ------------------------------------------------------------------ |
| id               | int         | PK                                                                 |
| user_id          | uuid        | nullable FK → auth.users (guest checkout allowed)                  |
| customer_name    | text        |                                                                    |
| customer_phone   | text        |                                                                    |
| customer_address | text        |                                                                    |
| comment          | text        | nullable                                                           |
| items            | jsonb       | array of cart items (frozen at checkout, incl. image URLs)         |
| total            | numeric     | goods + delivery                                                   |
| delivery_type    | text        | nullable                                                           |
| delivery_cost    | numeric     | not null, default 0                                                |
| status           | text        | `new` \| `confirmed` \| `processing` \| `delivered` \| `cancelled` |
| notified_at      | timestamptz | nullable — when the admin email was confirmed sent; NULL = never   |
| created_at       | timestamptz |                                                                    |

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

| file                   | purpose                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- |
| `product.service.ts`   | Product CRUD, label/category/brand queries, search, autocomplete, admin listing |
| `brand.service.ts`     | Brand queries (public + admin)                                                  |
| `category.service.ts`  | Category tree queries (public + admin, ordered by `sort_order`)                 |
| `order.service.ts`     | Order creation & listing, admin listing + status counts                         |
| `profile.service.ts`   | User profile read/write                                                         |
| `cart.service.ts`      | DB cart sync (auth users): load/upsert/delete/clear/reconcile                   |
| `favorites.service.ts` | DB favorites sync (auth users): load ids, add/remove, full product list         |
| `banner.service.ts`    | Banner queries, split by `type` (`desktop`/`mobile`)                            |
| `user.service.ts`      | Account list for the admin — Auth admin API + `profiles`, service-role only     |

## Lib Utilities (`/lib/`)

| file                      | purpose                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase-server.ts`      | `createClient()` — SSR Supabase with cookies                                                                                                                                                                                                                                                                                                                                                   |
| `supabase-browser.ts`     | `createClient()` — client-side Supabase                                                                                                                                                                                                                                                                                                                                                        |
| `supabase.ts`             | Direct anon-key client (used by `unstable_cache()` wrappers)                                                                                                                                                                                                                                                                                                                                   |
| `cn.ts`                   | `cn(...classes)` — clsx + tailwind-merge                                                                                                                                                                                                                                                                                                                                                       |
| `cached-queries.ts`       | ISR-cached wrappers via `unstable_cache()`                                                                                                                                                                                                                                                                                                                                                     |
| `auth.ts`                 | `requireAuth()` — server-side auth guard, redirects to `/auth`                                                                                                                                                                                                                                                                                                                                 |
| `constants.ts`            | `SITE_URL`/`LEGACY_SITE_URL`/`SPECIALS_BASE_URL`, `LABEL_MAP` (badge text/color for `new`/`sale`), `ORDER_STATUS` (label/color), and the delivery tariff: `DELIVERY_OPTIONS`, `FREE_DELIVERY_THRESHOLD`, `getDeliveryCost()`, `deliveryFreeNote()`                                                                                                                                             |
| `page-params.ts`          | `parsePage()`, `parseSortParam()`, `parseBrandIds()` — URL helpers                                                                                                                                                                                                                                                                                                                             |
| `section-scroll.ts`       | Module-level singleton: `registerSectionScroller` / `scrollToSection` — lets `SubcategoryFilter` imperatively scroll `VirtualCategoryContent` without prop drilling                                                                                                                                                                                                                            |
| `active-section.ts`       | Pub/sub for the currently-visible section ID: `setActiveSection` / `subscribeActiveSection` — `VirtualCategoryContent` fires updates on scroll, `SubcategoryFilter` highlights the active pill                                                                                                                                                                                                 |
| `db.ts`                   | `soft()` / `strict()` — unwrap a Supabase response so a failed query stops looking like an empty one (`strict` where the result decides `notFound()`)                                                                                                                                                                                                                                          |
| `supabase-admin.ts`       | `createAdminClient()` — service-role client, bypasses RLS; never construct without an admin check right before it                                                                                                                                                                                                                                                                              |
| `safe-redirect.ts`        | `safeRedirect()` (same-origin `?next=` only) and `resolveOrigin()` (honours `x-forwarded-host` for allow-listed hosts only)                                                                                                                                                                                                                                                                    |
| `deploy-origin.ts`        | `DEPLOY_ORIGIN` / `IS_CANONICAL_HOST` — the origin this deployment actually serves on, as opposed to `SITE_URL`; drives the noindex guard and admin links in email. Unset on production since the cutover                                                                                                                                                                                      |
| `rate-limit.ts`           | `rateLimit()` — fixed-window limiter for public server actions, backed by the `rate_limit_hit` Postgres function; fails **open**                                                                                                                                                                                                                                                               |
| `roles.ts`                | `adminRole()` / `isSuperAdmin()` — the only readers of `app_metadata.role`; see the Auth section below                                                                                                                                                                                                                                                                                         |
| `mailer.ts`               | Admin order notification over SMTP (`nodemailer`), with a narrowed TLS name check for the hoster's certificate                                                                                                                                                                                                                                                                                 |
| `invoice.ts`              | Order PDF (`pdfkit` + bundled Roboto in `lib/fonts/`), attached to the notification email                                                                                                                                                                                                                                                                                                      |
| `order-pricing.ts`        | `parseLines()`, `buildQuote()`, `publishedPriceLookup()`, `money()` — the one place order money is computed; kept out of the action file so it can be tested without a database (`tests/order-pricing.test.ts`). Admin order edits share it: `validateOrderItems()`, `normalizeOrderItems()`, `priceOrder()`, `isManualDeliveryCost()`, `parsePriceInput()` (see the admin-editing note below) |
| `subcategory-sections.ts` | `buildCategorySection()` — groups a subcategory's products by sub-subcategory for `VirtualCategoryContent`                                                                                                                                                                                                                                                                                     |
| `legacy-redirect.ts`      | `redirectLegacyProduct()` — resolves an old JoomShopping product URL against `products.product_url` at request time                                                                                                                                                                                                                                                                            |
| `legacy-redirects.ts`     | Generated static map of the old site's non-product URLs (brands, categories, nav) → current ones; read by `proxy.ts`                                                                                                                                                                                                                                                                           |
| `seo.ts`                  | `pageMetadata({ title, description, path })` — one page's title, description, canonical and Open Graph block together, since a page that sets only some of them inherits the home page's for the rest                                                                                                                                                                                          |

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
| `getCachedCategoryProducts(categoryIds, sort)`      | 10 min | `products`                    |
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
cache.

`getCachedRelatedProducts` is keyed by **category alone**. Its `excludeId` used to be in the key,
which made the cache hold one entry per product (2400+) where one per category (~90) says the same
thing; `getRelatedProducts` therefore fetches `RELATED_PRODUCTS_LIMIT + 1` rows with the viewed
product still among them, and `/product/[id]` filters itself out — so a product inside its own pool
still has four neighbours to show. The rendered result is identical to the old query's.

## Zustand Stores (`/store/`)

- **cart store** (`store/cart.ts`) — cart items array, persisted to localStorage (key `"cart"`, only `items` is persisted); syncs with DB when user logs in (local items win on conflict, DB-only items appended, `reconcileCartItems` pushes local-only items back).
- **favorites store** (`store/favorites.ts`) — product IDs; syncs with DB on auth. Persisted to localStorage (key `"favorites"`, `ids` + `userId`) so a returning customer's hearts are right on first paint and survive an offline reload; `userId` rides along because the ids belong to one account, and they are dropped whenever a different user signs in or the current one signs out. Unlike the cart there is nothing to keep for a guest — `FavoriteButton` sends them to `/auth` rather than storing anything. A failed load leaves `initialized` false, which both keeps the button disabled and lets the next auth event retry.
- **toast store** (`store/toast.ts`) — notification queue, auto-dismiss after 3.5s, keeps at most 3 toasts.
- **mobile-menu store** (`store/mobile-menu.ts`) — boolean open/close state for mobile nav.

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
| production | `aloe.kg` (branch `main`)          | `dnlburbuchxzxdmhuczu` | **unset**               | yes     |
| staging    | `stage.aloe.kg` (branch `staging`) | its own project        | `https://stage.aloe.kg` | no      |

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
NEXT_PUBLIC_SUPABASE_URL        # prod: https://dnlburbuchxzxdmhuczu.supabase.co
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
                                # a leftover value noindexes the live shop. See MIGRATION.md.
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
production silently hides the live shop from search (see MIGRATION.md). An unset or malformed value
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
- Brand pages use `IntersectionObserver`-driven infinite scroll (`BrandProductsInfinite`) backed by a cached, paginated server action

**Admin mutations** always use a service-role client (bypasses RLS) and are gated by an `assertAdmin()` check inside the action itself (not just route-level middleware). User mutations use the anon client scoped by RLS to `auth.uid()`.

**Category page virtual scroll:** `/catalog/[slug]` renders all subcategory sections on one page using `VirtualCategoryContent` (`@tanstack/react-virtual` window virtualizer). `SubcategoryFilter` shows pills that jump to sections. The two are decoupled via module-level singletons: `lib/section-scroll.ts` (imperative scroll command) and `lib/active-section.ts` (pub/sub for the visible section id) — no shared React state or prop drilling needed.

**`ProductCard` is `React.memo`-wrapped:** it renders inside the virtualized category grid, carousels, and infinite-scroll brand pages, whose parents re-render on every scroll tick / page load — memoizing avoids re-rendering every visible card (and its `AddToCart`/`FavoriteButton` children) when its own props haven't changed.

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

**Admin list pages** (products/categories/brands/orders) share `useAdminListNav()` (syncs filters to the URL query string, resets pagination on filter change) and `useDebouncedSearch()` (debounces search input before triggering navigation).

**Drag-to-reorder** for admin categories and banners shares one hook, `useDragReorder()` — tracks drag/drop indices per group and hands back a reordered array; the caller persists the new `sort_order` via a server action (`reorderSubcategories()` / `reorderBanners()`).

**Product quick-view modal:** `ProductCard` links to `/product/[id]` normally; the `@modal` parallel route (`app/@modal/(.)product/[id]/page.tsx`) intercepts that soft navigation and renders it inside `ProductModal` instead, so browsing stays on the originating grid/carousel while the URL still updates. See "Quick-view modal" note under App Routes.

**Cache budget (Vercel Hobby).** The plan meters 200K ISR writes a month, and a write is charged
both for regenerating an ISR page and for filling a Data Cache entry — `unstable_cache` included.
That is the only metric this project has come close to (174K in a 30-day window; nothing else was
above ~35%), and the cause was never traffic, it was key cardinality times expiry rate. A single
product view that finds everything stale costs three writes: the `/product/[id]` ISR entry,
`getCachedProduct(id)`, and `getCachedRelatedProducts(...)`. So two things are load-bearing and
should be weighed before either is changed:

- **`revalidate` on `/product/[id]` tracks `CATALOGUE_TTL`.** Both are 10 min, so the page and the
  data it reads expire together — a shorter page TTL just rebuilds a page around unchanged data.
- **A cache key must not carry anything per-product that the query does not need.** `excludeId` on
  related products was the whole difference between ~90 entries and 2400.

Neither costs freshness, because tag invalidation, not the TTL, is what publishes an admin edit.

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

**Page metadata:** every indexable page builds its metadata with `pageMetadata()` (`lib/seo.ts`)
rather than writing the fields out, because Next merges `openGraph` with the root layout's instead
of deriving it from the page's own `title`/`description` — a page that omits the block silently
advertises the home page's name and URL in every WhatsApp/Telegram preview. Product pages are the
exception that proves the rule: they pass `title: { absolute: ... }` to skip the root
`"%s — Aloe.kg"` template, whose suffix would otherwise land on a title that already ends in
`| Aloe.kg`. Paginated pages (`/new`, `/sale`, `/popular`) point the canonical at `?page=N` itself,
not at page 1 — page 2 is not a duplicate of page 1, it is different products.

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

Because `viewport` sets `viewport-fit: cover`, `app/globals.css` carries the matching safe-area
insets: left/right on `body`, and the `safe-area-pb` utility that `MobileBottomNav` uses to stay
clear of the iPhone home indicator in standalone.

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

### Old-site sync (`scripts/joomla/`)

aloe.kg still runs the previous store (Joomla + JoomShopping) as production, so the catalogue there
keeps moving while this site is built. These scripts pull from it. Credentials live in
`scripts/joomla/.env.joomla` (git-ignored, see `lib.mjs` for the keys); scraped output lands in
`scripts/joomla/data/` (also git-ignored). Products are matched on `products.external_id`.

```bash
npm run backup:prod                                          # always first — dumps every table
node scripts/joomla/scrape-products.mjs                      # admin list → data/joomla-products.json
node scripts/joomla/diff-products.mjs --env=prod             # vs Supabase → data/diff.json + report
node scripts/joomla/sync-products.mjs --env=prod --execute --i-know-this-is-production
node scripts/joomla/reimage-products.mjs --env=prod          # rebuild both image variants
```

`reimage-products.mjs` reads JoomShopping's `full_<name>` file — the untouched original upload — and
writes `<id>.webp` + `thumb/<id>.webp`. It is resumable (`data/reimage-state.json`) and skips any
product whose current image came from the new admin, so manual re-uploads are never overwritten.

Two maintenance scripts finish the job for anything the old site cannot supply:

```bash
node scripts/normalize-product-images.mjs --env=prod   # row not yet a WebP pair → build it from Storage
node scripts/prune-orphan-images.mjs --env=prod        # bucket objects nothing references (--execute deletes)
node scripts/fix-orphan-categories.mjs --env=prod      # products whose category_id was stripped
node scripts/purge-test-data.mjs --env=prod            # pre-launch orders/accounts/counters
node scripts/seed-staging.mjs --env=stage              # production catalogue → staging (no personal data)
node scripts/generate-app-icons.mjs                    # app/icon.svg → the manifest's PNG icons
node scripts/build-legacy-redirects.mjs --env=prod     # old site's URLs → lib/legacy-redirects.ts
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

`fix-orphan-categories.mjs` cleans up after the category FK's old `ON DELETE SET NULL`: 91 products
lost their `category_id` when a category was deleted and keep only the denormalised `category`
label, which the tree reorganisation renamed. It matches that label to a leaf category ignoring
case, ё/е and punctuation, takes judgement calls from an `OVERRIDES` table in the file, and reports
the rest with candidates rather than guessing. `prune-orphan-images.mjs` checks `orders.items` as well as both product columns, because an
order freezes its line items' image URLs and those files must outlive the product. It also holds
back admin-uploaded originals (`<epoch-ms>-<rand>.<ext>`) unless `--originals` is passed —
normalizing a product leaves its original unreferenced, but that file is the only high-quality
source left for re-encoding it.

Two things are deliberately never synced from the old site: **`category_id`/`category`** (the tree was
reorganized in `scripts/migrate-categories.mjs` and no longer maps 1:1) and products **without an
`external_id`** (created in the new admin). Deletions on the old site unpublish here rather than
delete, because `orders.items` references the row.
