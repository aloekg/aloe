"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import Currency from "@/components/Currency";
import MainContainer from "@/components/MainContainer";
import MobileHeader from "@/components/MobileHeader";
import QuantityStepper from "@/components/QuantityStepper";
import Title from "@/components/Title";
import { useIsClient } from "@/hooks/useIsClient";
import { MIN_ORDER_TOTAL } from "@/lib/constants";
import { useCart } from "@/store/cart";

export default function CartPage() {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const increment = useCart((s) => s.increment);
  const decrement = useCart((s) => s.decrement);
  const total = useCart((s) => s.total);
  const clear = useCart((s) => s.clear);
  const isClient = useIsClient();
  // The cart store rehydrates from localStorage synchronously, so the server's empty-cart
  // markup never matches the first client render. Hold a placeholder until we're on the client.
  if (!isClient) {
    return (
      <>
        <MobileHeader title="Корзина" />
        <MainContainer>
          <div className="py-16 h-96" aria-busy="true" />
        </MainContainer>
      </>
    );
  }
  if (items.length === 0) {
    return (
      <>
        <MobileHeader title="Корзина" />
        <MainContainer className="text-center py-16 pt-28">
          <p className="text-gray-500 text-lg">Корзина пуста</p>
          <Link href="/catalog" className="text-green-600 text-sm mt-2 inline-block hover:underline">
            Перейти в каталог
          </Link>
        </MainContainer>
      </>
    );
  }
  const shortfall = Math.max(0, MIN_ORDER_TOTAL - total());

  return (
    <>
      <MobileHeader title="Корзина">
        <Button variant="ghost" size="md" onClick={clear} className="absolute right-4">
          Очистить
        </Button>
      </MobileHeader>
      <MainContainer className="pb-40 md:pb-20">
        <Title className="hidden md:block mb-6">Корзина</Title>
        <div className="flex flex-col divide-y divide-gray-100">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 md:gap-4 p-2 md:p-3">
              <div className="relative size-16 md:size-20 shrink-0 bg-gray-50 rounded">
                <Image
                  src={item.image_url}
                  alt={item.name}
                  fill
                  sizes="(max-width: 768px) 56px, 64px"
                  className="object-contain p-1"
                />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium line-clamp-3 mb-1">{item.name}</p>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-green-600 font-medium md:font-bold">
                    {item.price} <Currency />
                  </p>
                  <QuantityStepper
                    quantity={item.quantity}
                    onDecrement={() => decrement(item.id)}
                    onIncrement={() => increment(item.id)}
                    label={item.name}
                    size="sm"
                    variant="pill"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Gated on the cart's own localStorage prices, which is what "Итого" above shows too — so
            the button matches the number on screen. Checkout re-quotes on the server and refuses
            there as well; this only saves the trip. */}
        {shortfall > 0 && (
          <p className="mt-4 text-sm bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 text-amber-900">
            Минимальная сумма заказа — {MIN_ORDER_TOTAL} <Currency />. Добавьте ещё на{" "}
            <span className="font-medium">
              {shortfall} <Currency />
            </span>
            .{" "}
            <Link href="/catalog" className="text-green-700 underline">
              Перейти в каталог
            </Link>
          </p>
        )}
        <div className="mt-6 md:border-t md:pt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-gray-500 text-sm">Итого:</p>
            <p className="text-2xl font-bold text-green-600">
              {total()} <Currency />
            </p>
          </div>
          <div className="hidden md:flex flex-wrap gap-3">
            <Button variant="secondary" onClick={clear} className="min-w-40 flex-1 shrink-0">
              Очистить
            </Button>
            <Button
              variant="primary"
              onClick={() => router.push("/checkout")}
              disabled={shortfall > 0}
              className="min-w-40 flex-1 sm:flex-none sm:px-6"
            >
              Оформить заказ
            </Button>
          </div>
          <div className="md:hidden fixed bottom-20 left-0 right-0 px-8 flex">
            <Button
              variant="primary"
              size="lg"
              onClick={() => router.push("/checkout")}
              disabled={shortfall > 0}
              className="min-w-40 flex-1"
            >
              Оформить заказ
            </Button>
          </div>
        </div>
      </MainContainer>
    </>
  );
}
