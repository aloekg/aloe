import Image from "next/image";
import { notFound } from "next/navigation";
import { AddToCart, Currency, FavoriteButton, OldPrice, ProductDescription } from "@/components";
import ProductModal from "@/components/ProductModal";
import { getCachedProduct } from "@/lib/cached-queries";
import { LABEL_MAP } from "@/lib/constants";
import type { ProductRow } from "@/types";
import { withBrandName } from "@/types";

export default async function ProductModalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const rawProduct = await getCachedProduct(Number(id));

  if (!rawProduct) notFound();

  const brandInfo = (rawProduct as unknown as { brands?: { name: string; slug: string } | null }).brands;
  const product = withBrandName([rawProduct as unknown as ProductRow])[0];

  const label = product.label ? LABEL_MAP[product.label as keyof typeof LABEL_MAP] : null;
  const discount =
    product.old_price && product.old_price > product.price
      ? Math.round(((product.old_price - product.price) / product.old_price) * 100)
      : null;
  const productHref = `/product/${product.id}`;
  // The modal itself shows the large image; cart rows are ~64px.
  const cartImage = product.thumbnail_url || product.image_url;

  return (
    <ProductModal>
      <div className="grid sm:grid-cols-2 gap-6 px-4 pb-4 md:px-6 md:pb-6">
        <div className="relative md:sticky md:top-0 aspect-square bg-gray-50 rounded-xl overflow-hidden">
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            className="object-contain"
            sizes="(max-width: 640px) 100vw, 50vw"
          />
          {label && (
            <div className="absolute top-3 left-3">
              <span className={`${label.cls} text-xs font-semibold px-2 py-1 rounded`}>{label.text}</span>
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
          <a href={productHref} className="text-lg font-semibold mb-2 hover:underline w-fit">
            {product.name}
          </a>

          {brandInfo && <p className="text-sm text-gray-500 mb-4">Производитель: {brandInfo.name}</p>}

          <div className="hidden md:flex items-baseline gap-3 mb-6">
            <span className="text-2xl font-bold">
              {product.price} <Currency />
            </span>
            {product.old_price && <OldPrice value={product.old_price} className="text-lg text-gray-500" />}
          </div>

          <div className="mb-6 hidden sm:block">
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

          <a href={productHref} className="text-sm text-green-700 hover:underline mt-auto pt-4 w-fit">
            Открыть страницу товара →
          </a>
        </div>
      </div>

      <div className="sm:hidden sticky bottom-0 z-10 bg-white border-t border-gray-200 px-4 py-3 rounded-b-2xl shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <div className="grow flex flex-col leading-tight shrink-0">
            <span className="text-lg font-bold whitespace-nowrap">
              {product.price} <Currency />
            </span>
            {product.old_price && (
              <OldPrice value={product.old_price} className="text-xs text-gray-500 whitespace-nowrap" />
            )}
          </div>
          <div className="grow">
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
    </ProductModal>
  );
}
