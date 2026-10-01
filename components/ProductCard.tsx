"use client";

import { memo } from "react";
import Image from "next/image";
import Link from "next/link";
import { LABEL_MAP } from "@/lib/constants";
import { averageRating, reviewPlural } from "@/lib/reviews";
import type { ProductListItem } from "@/types";
import AddToCart from "./AddToCart";
import Currency from "./Currency";
import FavoriteButton from "./FavoriteButton";
import OldPrice from "./OldPrice";
import StarRating, { formatRating } from "./StarRating";

type Props = {
  // Keep narrower than Product so description/seo_text stay out of list queries.
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
  const rating = averageRating(p.rating_sum, p.rating_count);
  const productHref = href ?? `/product/${p.id}`;
  const cardImage = p.thumbnail_url || p.image_url;

  // scroll={false}: the quick-view modal is position:fixed, so Next would otherwise scroll the grid to top.
  // alt="" on purpose: the link already carries the name as text.

  return (
    // FavoriteButton stays outside the <Link>: a <button> inside an <a> is invalid HTML.
    <div className={`relative flex flex-col rounded-lg overflow-hidden ${className}`}>
      <FavoriteButton productId={p.id} />
      <Link className="flex-1 flex flex-col" href={productHref} scroll={false}>
        <div className="relative p-2 aspect-square shadow-xs rounded-lg">
          <Image
            src={cardImage}
            alt=""
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
          {rating != null && (
            <span className="flex items-center gap-1 mt-1">
              <StarRating
                average={rating}
                label={`Оценка ${formatRating(rating)} из 5, ${p.rating_count} ${reviewPlural(p.rating_count)}`}
              />
              <span className="text-xs text-gray-500" aria-hidden>
                {p.rating_count}
              </span>
            </span>
          )}
          <div className="flex items-baseline gap-1.5 mt-1">
            <p className="text-base font-bold">
              {p.price} <Currency />
            </p>
            {p.old_price && <OldPrice value={p.old_price} className="text-sm text-gray-500" />}
          </div>
        </div>
      </Link>
      <AddToCart
        product={{
          id: p.id,
          name: p.name,
          price: p.price,
          image_url: cardImage,
        }}
      />
    </div>
  );
}

export default memo(ProductCard);
