"use client";

import { memo } from "react";
import Image from "next/image";
import Link from "next/link";
import { LABEL_MAP } from "@/lib/constants";
import type { ProductListItem } from "@/types";
import AddToCart from "./AddToCart";
import Currency from "./Currency";
import FavoriteButton from "./FavoriteButton";

type Props = {
  // Deliberately narrower than `Product`: the card renders seven fields, and typing it this way
  // keeps `description`/`seo_text` from being pulled into list queries again. A full `Product`
  // still satisfies it.
  product: ProductListItem;
  className?: string;
  href?: string;
  preload?: boolean;
};

function ProductBadge({ label }: { label: ProductListItem["label"] }) {
  if (!label) return null;
  const { text, cls } = LABEL_MAP[label];
  return (
    <div className="absolute top-1.5 left-1.5 z-10">
      <span className={`${cls} text-[10px] font-semibold px-1.5 py-0.5 rounded`}>{text}</span>
    </div>
  );
}

function ProductCard({ product: p, className = "", href, preload = false }: Props) {
  const productHref = href ?? `/product/${p.id}`;
  // The card never renders above ~300px, so it takes the small variant; the detail page and the
  // quick-view modal load `image_url`. Rows predating the thumbnail backfill fall back to it.
  const cardImage = p.thumbnail_url || p.image_url;

  return (
    // `relative` so FavoriteButton can sit over the image from outside the <Link>: a <button>
    // nested inside an <a> is invalid HTML and behaves unpredictably for keyboard and
    // screen-reader users.
    <div className={`relative flex flex-col rounded-lg overflow-hidden ${className}`}>
      <FavoriteButton productId={p.id} />
      <Link className="flex-1 flex flex-col" href={productHref}>
        <div className="relative p-2 aspect-square shadow-xs rounded-lg">
          <Image
            src={cardImage}
            alt={p.name}
            fill
            className="object-contain p-2"
            preload={preload}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          />
          <ProductBadge label={p.label} />
        </div>
        <div className="flex-1 flex flex-col py-3">
          <p className="flex-1 text-sm font-medium line-clamp-3 w-fit" title={p.name}>
            {p.name}
          </p>
          {p.brand_name && <p className="text-xs text-gray-500 mt-0.5 truncate">{p.brand_name}</p>}
          <div className="flex items-baseline gap-1.5 mt-1">
            <p className="text-base font-bold">
              {p.price} <Currency />
            </p>
            {p.old_price && (
              <p className="text-sm text-gray-500 line-through">
                {p.old_price} <Currency />
              </p>
            )}
          </div>
        </div>
      </Link>
      <AddToCart
        product={{
          id: p.id,
          name: p.name,
          price: p.price,
          // Cart rows render at ~64px. The order record itself is re-resolved from the DB in
          // `createOrder`, so this only affects what the cart displays.
          image_url: cardImage,
        }}
      />
    </div>
  );
}

export default memo(ProductCard);
