# Aloe.kg — Project Reference

## Tech Stack

- **Framework:** Next.js 16.2.9 (App Router, Server Components, Server Actions, React 19)
- **Language:** TypeScript 6.0.3 (strict mode, path alias `@/*` → root)
- **Database:** Supabase (PostgreSQL + Auth + Storage + RLS)
- **State:** Zustand 5.0.14 (only the cart store uses `persist`/localStorage; favorites/toast/mobile-menu don't — both cart and favorites also rehydrate from Supabase on auth)
- **Styling:** Tailwind CSS 4.3.1, no dark mode
- **UI libs:** Lucide React, React Icons, Embla Carousel (+ autoplay), react-markdown, nextjs-toploader, @tailwindcss/typography, @tanstack/react-virtual
- **Code quality:** ESLint 9, Prettier (120 char, import sorting via `@ianvs/prettier-plugin-sort-imports`)

## Directory Structure

```
/
├── app/                    # Next.js App Router pages
├── components/             # ~30 shared React components (barrel: components/index.ts)
├── hooks/                  # Custom React hooks
├── lib/                    # Supabase clients, caching, utilities
├── services/               # Data access layer (8 domain modules)
├── store/                  # Zustand stores (cart, favorites, toast, mobile-menu)
├── types/                  # TypeScript type definitions (index.ts) + generated database.ts
├── tests/                  # Vitest unit tests (pure helpers only — no DB, no DOM)
├── supabase/               # migrations/ (source of truth for the schema), sql/audit-rls.sql
├── scripts/                # Old-site sync + image maintenance (see below)
├── proxy.ts                # Middleware — Supabase auth cookie management
├── next.config.ts          # Image optimization disabled (unoptimized: true), devIndicators off
├── MIGRATION.md            # Domain cutover checklist (new.aloe.kg → aloe.kg)
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
```

Note: the `discount` label/route from earlier iterations has been removed — `Product["label"]` is now only `"new" | "sale" | null`.

Note: "popular" is no longer a manually-set admin label. `products.purchase_count` is incremented atomically (via the `increment_product_purchase_counts` Postgres RPC) in `app/checkout/actions.ts` when an order is placed, and `/popular` + the homepage carousel rank published products by `purchase_count` (`getPopularProducts` / `getPopularProductsPaginated` in `product.service.ts`, `getCachedPopularProducts` in `cached-queries.ts`). Products with `purchase_count = 0` are excluded, so the section stays hidden until at least one order has been placed.

**Quick-view modal:** `/product/[id]` also renders as a modal overlay via a parallel route — `app/@modal/(.)product/[id]/page.tsx` intercepts client-side navigation from `ProductCard`'s `<Link>` and renders `components/ProductModal.tsx` (closes on `Esc`/backdrop click via `router.back()`). A direct/hard navigation still renders the full `/product/[id]` page. `app/@modal/default.tsx` renders `null` when no intercept matches.

**Category page (`/catalog/[slug]`):** renders every subcategory of the top-level category as its own section in one `VirtualCategoryContent` window-virtualized scroll (`@tanstack/react-virtual`). `SubcategoryFilter` renders a pill per subcategory; clicking one calls `scrollToSection` (`lib/section-scroll.ts`) to jump to it, and the pill that's currently scrolled into view is tracked via `lib/active-section.ts` pub/sub and highlighted (`useActiveSectionSync`). As the active section changes, `SubcategoryFilter` mirrors it into the URL as `?sub=<subcategorySlug>` via `history.replaceState` directly (not `router.replace`) so the address bar stays shareable/bookmarkable without forcing a server re-render on every scroll tick. Landing on `/catalog/[slug]?sub=<slug>` (a shared link, a reload, or the breadcrumb/sitemap links below) resolves that slug to a subcategory id server-side and passes it to `VirtualCategoryContent` as `initialSectionId`, which scrolls to it on mount — reasserting the scroll position for the first ~20 frames to win a race against the App Router's own post-navigation scroll handling, which otherwise snaps it back to the top a couple of frames after mount.

**Sub-subcategories (3rd level):** `categories.parent_id` is self-referential, so a category can be nested one level deeper than a normal subcategory (category → subcategory → sub-subcategory). Sub-subcategories have **no page of their own** — `products.category_id` may point directly at one (instead of at the subcategory), and `/catalog/[slug]` groups that subcategory's products into per-sub-subcategory sections within its section rather than routing to a new URL. `getSubcategorySection`/`getCachedSubcategorySection` take an array of category ids (subcategory id + its sub-subcategory ids) so products assigned at either level still show up together. `sitemap.ts`, the homepage carousel grouping (`app/page.tsx`), and the product-detail breadcrumbs (`app/product/[id]/page.tsx`) all walk up to 2 `parent_id` hops to resolve the real top-level/subcategory pair, and link to the subcategory as `/catalog/[topSlug]?sub=[subSlug]`. Admin: `AdminCategories.tsx` renders 3 tiers and only allows a subcategory (not a sub-subcategory) as a parent, capping the tree at 3 levels; the product editor's category `<select>` only lists leaf categories (those with no children), labeled with their full breadcrumb path.

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

**Storage buckets:** `product-images` (product photos), `banners` (banner images), `categories` (category images)

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

function withBrandName(rows: ProductRow[]): Product[]; // maps brands.name → brand_name
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

## Lib Utilities (`/lib/`)

| file                      | purpose                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase-server.ts`      | `createClient()` — SSR Supabase with cookies                                                                                                                                                   |
| `supabase-browser.ts`     | `createClient()` — client-side Supabase                                                                                                                                                        |
| `supabase.ts`             | Direct anon-key client (used by `unstable_cache()` wrappers)                                                                                                                                   |
| `cn.ts`                   | `cn(...classes)` — clsx + tailwind-merge                                                                                                                                                       |
| `cached-queries.ts`       | ISR-cached wrappers via `unstable_cache()`                                                                                                                                                     |
| `auth.ts`                 | `requireAuth()` — server-side auth guard, redirects to `/auth`                                                                                                                                 |
| `constants.ts`            | `LABEL_MAP` (badge text/color for `new`/`sale`), `ORDER_STATUS` (label/color)                                                                                                                  |
| `page-params.ts`          | `parsePage()`, `parseSortParam()`, `parseBrandIds()` — URL helpers                                                                                                                             |
| `section-scroll.ts`       | Module-level singleton: `registerSectionScroller` / `scrollToSection` — lets `SubcategoryFilter` imperatively scroll `VirtualCategoryContent` without prop drilling                            |
| `active-section.ts`       | Pub/sub for the currently-visible section ID: `setActiveSection` / `subscribeActiveSection` — `VirtualCategoryContent` fires updates on scroll, `SubcategoryFilter` highlights the active pill |
| `db.ts`                   | `soft()` / `strict()` — unwrap a Supabase response so a failed query stops looking like an empty one (`strict` where the result decides `notFound()`)                                          |
| `supabase-admin.ts`       | `createAdminClient()` — service-role client, bypasses RLS; never construct without an admin check right before it                                                                              |
| `safe-redirect.ts`        | `safeRedirect()` (same-origin `?next=` only) and `resolveOrigin()` (honours `x-forwarded-host` for allow-listed hosts only)                                                                    |
| `deploy-origin.ts`        | `DEPLOY_ORIGIN` / `IS_CANONICAL_HOST` — the origin this deployment actually serves on, as opposed to `SITE_URL`; drives the noindex guard and admin links in email                             |
| `rate-limit.ts`           | `rateLimit()` — fixed-window limiter for public server actions, backed by the `rate_limit_hit` Postgres function; fails **open**                                                               |
| `mailer.ts`               | Admin order notification over SMTP (`nodemailer`), with a narrowed TLS name check for the hoster's certificate                                                                                 |
| `invoice.ts`              | Order PDF (`pdfkit` + bundled Roboto in `lib/fonts/`), attached to the notification email                                                                                                      |
| `subcategory-sections.ts` | `buildCategorySection()` — groups a subcategory's products by sub-subcategory for `VirtualCategoryContent`                                                                                     |

### Cached Queries (ISR tags & TTLs)

| function                                            | TTL    | tag          |
| --------------------------------------------------- | ------ | ------------ |
| `getCachedCategories()`                             | 1 hour | `categories` |
| `getCachedCategoriesWithSlug()`                     | 1 hour | `categories` |
| `getCachedBrands()`                                 | 1 hour | `brands`     |
| `getCachedBrandBySlug(slug)`                        | 1 hour | `brands`     |
| `getCachedActiveBanners()`                          | 1 hour | `banners`    |
| `getCachedProductsByLabel(label, limit?)`           | 60 s   | `products`   |
| `getCachedPopularProducts(limit?)`                  | 60 s   | `products`   |
| `getCachedProductsByCategories(ids, limit?)`        | 60 s   | `products`   |
| `getCachedProductsByBrand(id, page, pageSize)`      | 60 s   | `products`   |
| `getCachedHomePageCategoryProducts(groups, limit?)` | 60 s   | `products`   |
| `getCachedSubcategorySection(subcategoryId, sort)`  | 60 s   | `products`   |
| `getCachedSubcategoryProducts(subcategoryId, opts)` | 60 s   | `products`   |
| `getCachedBrandsForSubcategory(subcategoryId)`      | 60 s   | `products`   |

## Zustand Stores (`/store/`)

- **cart store** (`store/cart.ts`) — cart items array, persisted to localStorage (key `"cart"`, only `items` is persisted); syncs with DB when user logs in (local items win on conflict, DB-only items appended, `reconcileCartItems` pushes local-only items back).
- **favorites store** (`store/favorites.ts`) — product IDs; syncs with DB on auth. No persist middleware.
- **toast store** (`store/toast.ts`) — notification queue, auto-dismiss after 3.5s, keeps at most 3 toasts.
- **mobile-menu store** (`store/mobile-menu.ts`) — boolean open/close state for mobile nav.

## Server Actions

| file                            | actions                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/checkout/actions.ts`       | `createOrder()` — inserts via service-role client so guest (unauthenticated) checkout is allowed; clears server-side cart on success                                                                                                                                                                                                                                                |
| `app/profile/actions.ts`        | `saveProfile()`                                                                                                                                                                                                                                                                                                                                                                     |
| `app/brands/[brand]/actions.ts` | `loadMoreBrandProducts()` — cached, paginated, backs the infinite-scroll brand page                                                                                                                                                                                                                                                                                                 |
| `app/admin/actions.ts`          | `upsertProduct()`, `deleteProduct()`, `uploadProductImage()`, `upsertCategory()`, `deleteCategory()`, `uploadCategoryImage()`, `reorderSubcategories()`, `upsertBrand()`, `deleteBrand()`, `getBrands()`, `upsertBanner()`, `deleteBanner()`, `uploadBannerImage()`, `reorderBanners()`, `updateOrderStatus()` — all gated by `assertAdmin()` and run through a service-role client |

## Auth

- **Provider:** Supabase Auth
- **Methods:** Email/password + Google OAuth
- **Email flow:** sign up → email OTP → `/auth/confirm` route → redirect
- **OAuth flow:** Google PKCE → `/auth/confirm` code exchange
- **Admin check:** `user.app_metadata?.role === "admin"`
- **Server auth:** `createClient()` from `supabase-server.ts` (reads cookies); admin server actions additionally re-check via `assertAdmin()` before using the service-role client
- **Client sync:** `AuthSync` component listens to `onAuthStateChange` and calls `setUser()` on both the cart and favorites stores
- **Protected routes:** `/admin/*` (401 redirect if not admin), `/profile` (redirect to `/auth`)

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL        # https://dnlburbuchxzxdmhuczu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   # public/client-safe
SUPABASE_SERVICE_ROLE_KEY       # server-only, used in admin actions + guest checkout to bypass RLS

SMTP_HOST                       # mail.aloe.kg — order notifications to the admin
SMTP_PORT
SMTP_USER
SMTP_PASS
ADMIN_NOTIFICATION_EMAIL        # recipient; unset → notifications are skipped, not failed
SMTP_TLS_SERVERNAME             # optional, defaults to mail.hoster.kg (certificate name, see lib/mailer.ts)

DEPLOY_ORIGIN                   # optional; the origin THIS deployment serves on when it is not
                                # SITE_URL (aloe.kg) — currently https://new.aloe.kg. Unset means
                                # "this is the canonical domain". See MIGRATION.md.
```

**`SITE_URL` vs `DEPLOY_ORIGIN`:** `SITE_URL` (`lib/constants.ts`, hardcoded `https://aloe.kg`) is
the canonical domain — canonical tags, `metadataBase`, JSON-LD, the sitemap and the legacy-URL 301s
all use it, and they are written for the state _after_ the cutover. `DEPLOY_ORIGIN`
(`lib/deploy-origin.ts`) is where this build actually answers. While the two differ, `app/robots.ts`
returns `Disallow: /` and the root layout adds `noindex`, so the pre-cutover host on `new.aloe.kg`
cannot be indexed as a duplicate of the future `aloe.kg`. An unset/malformed `DEPLOY_ORIGIN` falls
back to `SITE_URL` on purpose: a missing variable must not noindex the live shop.

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

**Admin list pages** (products/categories/brands/orders) share `useAdminListNav()` (syncs filters to the URL query string, resets pagination on filter change) and `useDebouncedSearch()` (debounces search input before triggering navigation).

**Drag-to-reorder** for admin categories and banners shares one hook, `useDragReorder()` — tracks drag/drop indices per group and hands back a reordered array; the caller persists the new `sort_order` via a server action (`reorderSubcategories()` / `reorderBanners()`).

**Product quick-view modal:** `ProductCard` links to `/product/[id]` normally; the `@modal` parallel route (`app/@modal/(.)product/[id]/page.tsx`) intercepts that soft navigation and renders it inside `ProductModal` instead, so browsing stays on the originating grid/carousel while the URL still updates. See "Quick-view modal" note under App Routes.

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

**Primary color:** `#16a34a` (green-600)

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
npm run db:types    # regenerate types/database.ts from the linked Supabase project
```

### Schema changes

```bash
npx supabase migration list   # compare local history with the linked project
npx supabase db push          # apply supabase/migrations/
npm run db:types              # then regenerate the types and typecheck
```

### Old-site sync (`scripts/joomla/`)

aloe.kg still runs the previous store (Joomla + JoomShopping) as production, so the catalogue there
keeps moving while this site is built. These scripts pull from it. Credentials live in
`scripts/joomla/.env.joomla` (git-ignored, see `lib.mjs` for the keys); scraped output lands in
`scripts/joomla/data/` (also git-ignored). Products are matched on `products.external_id`.

```bash
node backups/backup-db.mjs                        # always first — dumps categories + products
node scripts/joomla/scrape-products.mjs           # admin product list → data/joomla-products.json
node scripts/joomla/diff-products.mjs             # vs Supabase → data/diff.json + a report
node scripts/joomla/sync-products.mjs --execute   # apply name/price/published, insert new, unpublish gone
node scripts/joomla/reimage-products.mjs          # rebuild both image variants from the originals
```

`reimage-products.mjs` reads JoomShopping's `full_<name>` file — the untouched original upload — and
writes `<id>.webp` + `thumb/<id>.webp`. It is resumable (`data/reimage-state.json`) and skips any
product whose current image came from the new admin, so manual re-uploads are never overwritten.

Two maintenance scripts finish the job for anything the old site cannot supply:

```bash
node scripts/normalize-product-images.mjs --execute  # any row not yet a WebP pair → build it from the file in Storage
node scripts/prune-orphan-images.mjs                 # list bucket objects nothing references (--execute deletes)
node scripts/fix-orphan-categories.mjs               # products whose category_id was stripped (--execute assigns)
```

`normalize-product-images.mjs` is the one to run after a bulk import or whenever
`image_url`/`thumbnail_url` disagree; it leaves existing WebP rows alone so nothing is re-encoded
twice. `fix-orphan-categories.mjs` cleans up after the category FK's old `ON DELETE SET NULL`: 91 products
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
