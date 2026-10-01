"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import Currency from "@/components/Currency";
import Pagination from "@/components/Pagination";
import { deliveryFreeNote, ORDER_STATUS } from "@/lib/constants";
import { orderCanBeReviewed } from "@/lib/reviews";
import { useCart } from "@/store/cart";
import { useToast } from "@/store/toast";
import type { Order, ProfileFields, ReviewWithProduct } from "@/types";
import PasswordChangeForm from "./PasswordChangeForm";
import ProfileForm from "./ProfileForm";
import ReviewsTab from "./ReviewsTab";

type TabKey = "orders" | "reviews" | "profile";

const TABS: { key: TabKey; label: string }[] = [
  { key: "orders", label: "История заказов" },
  { key: "reviews", label: "Отзывы" },
  { key: "profile", label: "Личные данные" },
];

export default function ProfileTabs({
  initial,
  passwordEmail,
  orders,
  page,
  totalPages,
  totalOrders,
  reviews,
}: {
  initial: ProfileFields | null;
  passwordEmail: string | null;
  orders: Order[];
  page: number;
  totalPages: number;
  totalOrders: number;
  reviews: ReviewWithProduct[];
}) {
  const [tab, setTab] = useState<TabKey>("orders");
  const addMany = useCart((s) => s.addMany);
  const show = useToast((s) => s.show);
  const router = useRouter();

  function repeatOrder(order: Order) {
    addMany(
      order.items.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        image_url: item.image_url,
        quantity: item.quantity,
      })),
    );
    show("Товары добавлены в корзину", "success");
    router.push("/cart");
  }

  return (
    <>
      <div
        role="tablist"
        aria-label="Разделы профиля"
        className="flex justify-start md:justify-center mb-6 gap-1 overflow-x-auto scrollbar-none"
      >
        {TABS.map(({ key, label }) => (
          <Button
            key={key}
            id={`profile-tab-${key}`}
            role="tab"
            aria-selected={tab === key}
            aria-controls={`profile-panel-${key}`}
            onClick={() => setTab(key)}
            className={`shrink-0 px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === key ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
            {key === "orders" && totalOrders > 0 && ` (${totalOrders})`}
            {key === "reviews" && reviews.length > 0 && ` (${reviews.length})`}
          </Button>
        ))}
      </div>

      {tab === "reviews" && (
        <div role="tabpanel" id="profile-panel-reviews" aria-labelledby="profile-tab-reviews">
          <ReviewsTab reviews={reviews} />
        </div>
      )}

      {tab === "profile" && (
        <div role="tabpanel" id="profile-panel-profile" aria-labelledby="profile-tab-profile">
          <ProfileForm
            initial={{ name: initial?.name ?? "", phone: initial?.phone ?? "", address: initial?.address ?? "" }}
          />
          {passwordEmail && <PasswordChangeForm email={passwordEmail} />}
        </div>
      )}

      {tab === "orders" && (
        <div role="tabpanel" id="profile-panel-orders" aria-labelledby="profile-tab-orders">
          {orders.length === 0 ? (
            <p className="text-gray-500 text-sm text-center">Заказов пока нет.</p>
          ) : (
            <>
              <div className="flex flex-col gap-4">
                {orders.map((order) => {
                  const s = (order.status && ORDER_STATUS[order.status]) || ORDER_STATUS.new;
                  return (
                    <div key={order.id} className="border border-gray-300 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-xs text-gray-500">
                            {new Date(order.created_at ?? 0).toLocaleDateString("ru-RU", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </p>
                          <p className="text-sm font-medium mt-0.5">Заказ #{order.id}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${s.cls}`}>{s.label}</span>
                      </div>

                      <ul className="text-sm text-gray-600 mb-3 flex flex-col gap-1">
                        {order.items.map((item, i) => (
                          <li key={i} className="flex justify-between">
                            <span>
                              {item.name} × {item.quantity}
                            </span>
                            <span>
                              {((item.price ?? 0) * item.quantity).toLocaleString("ru-RU")} <Currency />
                            </span>
                          </li>
                        ))}
                        {order.delivery_type && (
                          <li className="flex justify-between text-gray-500">
                            <span>Доставка</span>
                            <span>
                              {order.delivery_cost > 0 ? (
                                <>
                                  {order.delivery_cost.toLocaleString("ru-RU")} <Currency />
                                </>
                              ) : (
                                deliveryFreeNote(order.delivery_type)
                              )}
                            </span>
                          </li>
                        )}
                      </ul>

                      <div className="flex justify-between items-center border-t border-gray-300 pt-2">
                        <span className="font-semibold text-sm">
                          Итого: {order.total.toLocaleString("ru-RU")} <Currency />
                        </span>
                        <span className="flex items-center gap-2">
                          {orderCanBeReviewed(order.status) && order.review_token && (
                            <Link
                              href={`/review/${order.review_token}`}
                              className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-green-700 hover:bg-gray-50"
                            >
                              Оставить отзыв
                            </Link>
                          )}
                          <Button
                            variant="secondary"
                            onClick={() => repeatOrder(order)}
                            className="text-xs px-3 py-1.5"
                          >
                            Повторить заказ
                          </Button>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Pagination page={page} totalPages={totalPages} basePath="/profile" />
            </>
          )}
        </div>
      )}
    </>
  );
}
