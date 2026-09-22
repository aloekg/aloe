"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useIsClient } from "@/hooks/useIsClient";
import { useCart } from "@/store/cart";

export default function CartIcon() {
  const count = useCart((s) => s.count());
  const isClient = useIsClient();

  return (
    <Link
      href="/cart"
      aria-label={isClient && count > 0 ? `Корзина, товаров: ${count}` : "Корзина"}
      className="relative flex items-center gap-1 p-2 text-sm text-gray-500 hover:text-green-700"
    >
      <ShoppingCart className="size-5" />
      {isClient && count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -top-2 -right-2 bg-green-700 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center"
        >
          {count}
        </span>
      )}
    </Link>
  );
}
