import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AddToCart,
  Breadcrumb,
  Currency,
  FavoriteButton,
  JsonLd,
  MainContainer,
  ProductCard,
  ProductDescription,
  Title,
} from "@/components";
import { getCachedCategoriesWithSlug, getCachedProduct, getCachedRelatedProducts } from "@/lib/cached-queries";
import { LABEL_MAP, SITE_URL } from "@/lib/constants";
import { MERCHANT_RETURN_POLICY, OFFER_SHIPPING_DETAILS } from "@/lib/seo";
import { supabase } from "@/lib/supabase";
import { RELATED_PRODUCTS_LIMIT } from "@/services/product.service";
import type { ProductRow } from "@/types";
import { withBrandName } from "@/types";

// Matches CATALOGUE_TTL in lib/cached-queries.ts: this page's own ISR entry and the data-cache
// entries it reads expire together, so a stale page is not rebuilt only to reread stale data —
// and on Vercel's Hobby plan both count against the same 200K/month ISR-write budget.
export const revalidate = 600;

export async function generateStaticParams() {
  const { data } = await supabase
    .from("products")
    .select("id")
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((p) => ({ id: String(p.id) }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await getCachedProduct(Number(id));
  if (!product) return {};
  // `absolute` skips the root layout's "%s — Aloe.kg" template, which used to append a second
  // brand onto a title that already carries one: "… | Aloe.kg — Aloe.kg".
  const title = `${product.name} — купить в Бишкеке | Aloe.kg`;
  const description =
    product.seo_text || product.description || `${product.name} — цена ${product.price} с. Доставка по Бишкеку.`;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/product/${id}` },
    openGraph: {
      title: product.name,
      description,
      url: `/product/${id}`,
      images: product.image_url ? [{ url: product.image_url }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const rawProduct = await getCachedProduct(Number(id));

  if (!rawProduct) notFound();

  const brandInfo = (rawProduct as unknown as { brands?: { name: string; slug: string } | null }).brands;
  const product = withBrandName([rawProduct as unknown as ProductRow])[0];

  const [relatedPool, allCategories] = await Promise.all([
    getCachedRelatedProducts(product.category_id),
    getCachedCategoriesWithSlug(),
  ]);

  // The pool is cached per category and still contains this product — see getRelatedProducts.
  const related = relatedPool.filter((p) => p.id !== product.id).slice(0, RELATED_PRODUCTS_LIMIT);

  // product.category_id may point at a subcategory (2 levels) or a sub-subcategory (3 levels,
  // no page of its own) — walk up to find the top-level category and the subcategory whose
  // section it belongs to on the /catalog/[slug] page (jumped to via the `sub` query param).
  const productCategory = allCategories?.find((c) => c.id === product.category_id);
  const productParent = productCategory?.parent_id
    ? allCategories?.find((c) => c.id === productCategory.parent_id)
    : null;
  const productGrandparent = productParent?.parent_id
    ? allCategories?.find((c) => c.id === productParent.parent_id)
    : null;

  const topCategory = productGrandparent ?? productParent;
  const subcategory = productGrandparent ? productParent : productCategory;

  // Falls back to the catalog index — `/catalog/[slug]` resolves by slug, so a raw
  // category_id there would 404.
  const catalogHref = topCategory && subcategory ? `/catalog/${topCategory.slug}?sub=${subcategory.slug}` : "/catalog";

  const breadcrumbs =
    topCategory && subcategory
      ? [
          { label: "Главная", href: "/" },
          { label: topCategory.name, href: `/catalog/${topCategory.slug}` },
          { label: subcategory.name, href: catalogHref },
          ...(productCategory && productCategory.id !== subcategory.id
            ? [{ label: productCategory.name, href: catalogHref }]
            : []),
          { label: product.name },
        ]
      : [
          { label: "Главная", href: "/" },
          { label: productCategory?.name ?? product.category, href: catalogHref },
          { label: product.name },
        ];

  const label = product.label ? LABEL_MAP[product.label as keyof typeof LABEL_MAP] : null;
  const discount =
    product.old_price && product.old_price > product.price
      ? Math.round(((product.old_price - product.price) / product.old_price) * 100)
      : null;
  // This page shows the large image; cart rows are ~64px.
  const cartImage = product.thumbnail_url || product.image_url;

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: [product.image_url],
    description: product.description || product.seo_text || product.name,
    ...(brandInfo && { brand: { "@type": "Brand", name: brandInfo.name } }),
    sku: String(product.id),
    offers: {
      "@type": "Offer",
      url: `${SITE_URL}/product/${product.id}`,
      priceCurrency: "KGS",
      price: product.price,
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      // No priceValidUntil: Google only warns about its absence, and every way to produce one
      // here is either impure in render or a date we cannot actually stand behind. Add it once
      // the schema carries a real price validity or stock field.
      shippingDetails: OFFER_SHIPPING_DETAILS,
      hasMerchantReturnPolicy: MERCHANT_RETURN_POLICY,
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.label,
      item: `${SITE_URL}${crumb.href ?? `/product/${product.id}`}`,
    })),
  };

  return (
    <MainContainer>
      <JsonLd data={productJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <Breadcrumb crumbs={breadcrumbs} />

      <div className="grid md:grid-cols-2 gap-8 mb-12">
        <div className="relative md:sticky md:top-41.5 aspect-square bg-gray-50 rounded-xl overflow-hidden">
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            className="object-contain p-6"
            preload
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          {label && (
            <div className="absolute top-3 left-3">
              <span className={`${label.cls} text-white text-xs font-semibold px-2 py-1 rounded`}>{label.text}</span>
            </div>
          )}
          {discount && (
            <div className="absolute top-3 right-12">
              <span className="bg-red-500 text-white text-xs font-semibold px-2 py-1 rounded">−{discount}%</span>
            </div>
          )}
          <FavoriteButton productId={product.id} />
        </div>

        <div className="flex flex-col">
          <Link href={catalogHref} className="text-sm text-green-600 hover:underline mb-2 w-fit">
            {product.category}
          </Link>

          <Title className="mb-2">{product.name}</Title>

          {brandInfo && (
            <p className="text-sm text-gray-500 mb-4">
              Производитель:{" "}
              <Link href={`/brands/${brandInfo.slug}`} className="text-green-600 hover:underline">
                {brandInfo.name}
              </Link>
            </p>
          )}

          <div className="flex items-baseline gap-3 mb-6">
            <span className="text-2xl md:text-3xl font-bold">
              {product.price} <Currency />
            </span>
            {product.old_price && (
              <span className="text-lg text-gray-400 line-through">
                {product.old_price} <Currency />
              </span>
            )}
          </div>

          <div className="mb-6 hidden md:block">
            <AddToCart
              product={{
                id: product.id,
                name: product.name,
                price: product.price,
                image_url: cartImage,
              }}
              size="lg"
            />
          </div>

          {product.description && <ProductDescription text={product.description} />}
        </div>
      </div>

      <div className="md:hidden fixed inset-x-0 bottom-18 z-30 bg-white border-t border-gray-200 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
        <div className="flex items-center gap-3">
          <div className="flex flex-col leading-tight shrink-0">
            <span className="text-lg font-bold whitespace-nowrap">
              {product.price} <Currency />
            </span>
            {product.old_price && (
              <span className="text-xs text-gray-400 line-through whitespace-nowrap">
                {product.old_price} <Currency />
              </span>
            )}
          </div>
          <div className="flex-1">
            <AddToCart
              product={{
                id: product.id,
                name: product.name,
                price: product.price,
                image_url: cartImage,
              }}
              size="lg"
            />
          </div>
        </div>
      </div>

      {related && related.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4">Похожие товары</h2>
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
            {related.map((p) => (
              <ProductCard key={p.id} product={p} href={`/product/${p.id}`} />
            ))}
          </div>
        </section>
      )}
    </MainContainer>
  );
}
