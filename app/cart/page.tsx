"use client";

import { useMemo, useState } from "react";
import { Trash2Icon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import Currency from "@/components/Currency";
import FavoriteButton from "@/components/FavoriteButton";
import MainContainer from "@/components/MainContainer";
import MobileHeader from "@/components/MobileHeader";
import QuantityStepper from "@/components/QuantityStepper";
import Sheet from "@/components/Sheet";
import Title from "@/components/Title";
import { useIsClient } from "@/hooks/useIsClient";
import { MIN_ORDER_TOTAL } from "@/lib/constants";
import { money } from "@/lib/order-pricing";
import { selectedItems, useCart } from "@/store/cart";

function goodsPlural(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "товар";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "товара";
  return "товаров";
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="size-4 shrink-0 cursor-pointer rounded accent-green-700"
    />
  );
}

export default function CartPage() {
  const router = useRouter();
  const items = useCart((s) => s.items);
  const excluded = useCart((s) => s.excluded);
  const increment = useCart((s) => s.increment);
  const decrement = useCart((s) => s.decrement);
  const remove = useCart((s) => s.remove);
  const toggleSelected = useCart((s) => s.toggleSelected);
  const setAllSelected = useCart((s) => s.setAllSelected);
  const removeMany = useCart((s) => s.removeMany);
  const [confirming, setConfirming] = useState(false);
  const isClient = useIsClient();

  const selected = useMemo(() => selectedItems(items, excluded), [items, excluded]);
  const selectedTotal = money(selected.reduce((sum, i) => sum + i.price * i.quantity, 0));
  const selectedCount = selected.reduce((sum, i) => sum + i.quantity, 0);

  // The cart rehydrates from localStorage synchronously; hold a placeholder until on the client to avoid a hydration mismatch.
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
          <Link href="/catalog" className="text-green-700 text-sm mt-2 inline-block hover:underline">
            Перейти в каталог
          </Link>
        </MainContainer>
      </>
    );
  }

  const allSelected = selected.length === items.length;
  // Counted on the ticked lines: those are what checkout will order.
  const shortfall = selected.length > 0 ? money(Math.max(0, MIN_ORDER_TOTAL - selectedTotal)) : 0;
  const canCheckout = selected.length > 0 && shortfall === 0;
  const hint =
    selected.length === 0 ? (
      "Выберите товары, чтобы перейти к оформлению"
    ) : shortfall > 0 ? (
      <>
        До минимальной суммы заказа не хватает {shortfall} <Currency />
      </>
    ) : null;

  const checkout = (
    <Button
      variant="primary"
      size="md"
      onClick={() => router.push("/checkout")}
      disabled={!canCheckout}
      className="shrink-0 px-4 py-2"
    >
      <span className="sm:hidden">К оформлению</span>
      <span className="hidden sm:inline">Перейти к оформлению</span>
    </Button>
  );

  const summary = (
    <div>
      <p className="text-lg md:text-2xl font-bold">
        {selectedTotal} <Currency />
      </p>
      <p className="text-xs md:text-sm text-gray-500 whitespace-nowrap">
        {selectedCount > 0 ? `${selectedCount} ${goodsPlural(selectedCount)}` : "Товары не выбраны"}
      </p>
    </div>
  );

  return (
    <>
      <MobileHeader title="Корзина">
        <Button
          onClick={() => setConfirming(true)}
          disabled={selected.length === 0}
          title="Удалить выбранные"
          aria-label="Удалить выбранные товары"
          className="absolute right-4 size-10 flex items-center justify-center rounded-full bg-white text-gray-700 transition-colors hover:text-red-600"
        >
          <Trash2Icon className="size-5" />
        </Button>
      </MobileHeader>
      <MainContainer className="pb-56 md:pb-20">
        <Title className="hidden md:block mb-6">Корзина</Title>
        <div className="md:grid md:grid-cols-[1fr_20rem] md:gap-8 md:items-start">
          <div>
            <label className="flex items-center gap-2.5 py-2.5 border-b border-gray-100 cursor-pointer select-none">
              <Checkbox
                checked={allSelected}
                onChange={() => setAllSelected(!allSelected)}
                label="Выбрать все товары"
              />
              <span className="text-sm">Выбрать все</span>
              <span className="ml-auto text-xs text-gray-500">
                {selected.length} из {items.length}
              </span>
            </label>

            <ul className="divide-y divide-gray-100">
              {items.map((item) => {
                const isSelected = !excluded.includes(item.id);
                return (
                  <li key={item.id} className="py-3">
                    <div className="flex gap-3">
                      <div className="relative size-20 md:size-24 shrink-0">
                        <Link
                          href={`/product/${item.id}`}
                          className="block relative size-full bg-gray-50 rounded-xl overflow-hidden"
                        >
                          <Image
                            src={item.image_url}
                            alt={item.name}
                            fill
                            sizes="96px"
                            className="object-contain p-1"
                          />
                        </Link>
                        <span className="absolute top-1 left-1 flex rounded bg-white/90 p-0.5">
                          <Checkbox
                            checked={isSelected}
                            onChange={() => toggleSelected(item.id)}
                            label={`Выбрать: ${item.name}`}
                          />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-bold leading-tight">
                          {money(item.price * item.quantity)} <Currency />
                        </p>
                        <Link
                          href={`/product/${item.id}`}
                          className="mt-0.5 block text-[13px] leading-snug line-clamp-3 hover:underline"
                        >
                          {item.name}
                        </Link>
                        {/* Under the name, not under the price: there it pushed the name down on the second unit. */}
                        {item.quantity > 1 && (
                          <p className="mt-0.5 text-xs text-gray-500">
                            {item.price} <Currency />
                            /ед.
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <FavoriteButton productId={item.id} variant="inline" />
                      <Button
                        onClick={() => remove(item.id)}
                        title="Удалить"
                        aria-label={`Удалить ${item.name} из корзины`}
                        className="size-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200"
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                      <QuantityStepper
                        quantity={item.quantity}
                        onDecrement={() => decrement(item.id)}
                        onIncrement={() => increment(item.id)}
                        label={item.name}
                        size="md"
                        variant="pill"
                        removeAtMinimum={false}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <aside className="hidden md:flex md:sticky md:top-45 flex-col gap-4 rounded-2xl border border-gray-200 p-5">
            {summary}
            {hint && <p className="text-sm text-gray-500">{hint}</p>}
            {checkout}
            <Button
              variant="secondary"
              onClick={() => setConfirming(true)}
              disabled={selected.length === 0}
              className="inline-flex items-center justify-center gap-2"
            >
              <Trash2Icon className="size-4" />
              Удалить выбранные
            </Button>
          </aside>
        </div>
      </MainContainer>

      {/* Above MobileBottomNav, which is ~80px with the safe area. */}
      <div className="md:hidden fixed left-0 right-0 bottom-20 z-30 px-4">
        {hint && (
          <p className="mb-2 w-fit rounded-lg bg-gray-200/95 px-3 py-1 text-xs text-gray-700 backdrop-blur-xs">
            {hint}
          </p>
        )}
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-2.5 shadow-[0_-2px_16px_rgba(0,0,0,0.08)]">
          {summary}
          {checkout}
        </div>
      </div>

      {confirming && (
        <Sheet heading="Удалить выбранные товары?" onClose={() => setConfirming(false)} width="max-w-md">
          <div className="px-4 pb-6 flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              {selected.length === items.length
                ? "Из корзины будут убраны все товары."
                : `Из корзины будут убраны выбранные: ${selected.length} из ${items.length}. Остальные останутся.`}{" "}
              Отменить это будет нельзя.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setConfirming(false)} className="flex-1">
                Оставить
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  removeMany(selected.map((i) => i.id));
                  setConfirming(false);
                }}
                className="flex-1 bg-red-700 hover:bg-red-800 disabled:hover:bg-red-700"
              >
                Удалить
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}
