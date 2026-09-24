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
  const rating = averageRating(p.rating_sum, p.rating_count);
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
      {/* `scroll={false}`: this link is intercepted into the quick-view modal, and the modal is
          `position: fixed`, which Next's post-navigation scroll handler skips (layout-router's
          `shouldSkipElement`). With no sibling left to consider it falls back to
          `documentElement.scrollTop = 0`, so opening a quick view silently sent the grid behind
          it back to the top — visible on closing, and it reset the category page's sticky
          subcategory bar out of its scrolled layout. */}
      <Link className="flex-1 flex flex-col" href={productHref} scroll={false}>
        <div className="relative p-2 aspect-square shadow-xs rounded-lg">
          {/* alt="": the same link carries the name as text, and an alt repeating it made every
              card announce its name twice. The photo adds nothing the name does not say. */}
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
          {/* Nothing at all when unrated: only 5% of the catalogue has ever been delivered, and an
              empty row of grey stars on the rest would read as "rated badly" rather than "new". */}
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
          // Cart rows render at ~64px. The order record itself is re-resolved from the DB in
          // `createOrder`, so this only affects what the cart displays.
          image_url: cardImage,
        }}
      />
    </div>
  );
}

export default memo(ProductCard);
