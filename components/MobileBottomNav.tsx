"use client";

import { HandbagIcon, Heart, Home, ShoppingBasketIcon, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useIsClient } from "@/hooks/useIsClient";
import { useCart } from "@/store/cart";

const items = [
  { href: "/", icon: Home, label: "Главная" },
  { href: "/catalog", icon: HandbagIcon, label: "Каталог" },
  { href: "/favorites", icon: Heart, label: "Избранное" },
  { href: "/profile", icon: User, label: "Профиль" },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const count = useCart((s) => s.count());
  const isClient = useIsClient();

  const badge = isClient && count > 0 ? count : 0;

  return (
    <nav aria-label="Основная навигация" className="fixed bottom-0 left-0 right-0 z-40 md:hidden safe-area-pb px-4">
      <div className="flex justify-center gap-2">
        <div className="flex items-center justify-around bg-white/50 rounded-full p-1 backdrop-blur-xs">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 px-5 py-3 transition-colors text-green-700 rounded-full ${
                  isActive ? "bg-black/10" : ""
                }`}
              >
                <div className="relative">
                  <Icon className="size-6" />
                </div>
              </Link>
            );
          })}
        </div>

        <div className="flex items-center justify-around bg-white/50 rounded-full backdrop-blur-xs">
          <Link
            href="/cart"
            aria-label={badge > 0 ? `Корзина, товаров: ${badge}` : "Корзина"}
            aria-current={pathname === "/cart" ? "page" : undefined}
            className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 p-4 transition-colors text-green-700 rounded-full ${
              pathname === "/cart" ? "bg-black/10" : ""
            }`}
          >
            <div className="relative">
              <ShoppingBasketIcon className="size-6" />
              {badge > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-2 -right-2 bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center"
                >
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </div>
          </Link>
        </div>
      </div>
    </nav>
  );
}
