"use client";

import cn from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Заказы", href: "/admin/orders" },
  { label: "Аналитика", href: "/admin/analytics" },
  { label: "Товары", href: "/admin/products" },
  { label: "Категории", href: "/admin/categories" },
  { label: "Бренды", href: "/admin/brands" },
  { label: "Отзывы", href: "/admin/reviews" },
  { label: "Баннеры", href: "/admin/banners" },
];

const SUPERADMIN_TABS = [{ label: "Пользователи", href: "/admin/users" }];

export default function AdminNav({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = isSuperAdmin ? [...TABS, ...SUPERADMIN_TABS] : TABS;
  return (
    <div className="flex gap-1 mb-4 md:mb-6 md:border-b border-gray-200 overflow-x-auto overflow-y-hidden md:overflow-visible">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "px-4 py-2 text-sm font-medium -mb-px md:border-b-2",
            pathname.startsWith(t.href)
              ? "border-green-600 text-green-700"
              : "border-transparent text-gray-500 hover:text-gray-700",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
