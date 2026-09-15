"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Minus, Plus, Search, Trash2, X } from "lucide-react";
import Button from "@/components/Button";
import Currency from "@/components/Currency";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { MIN_QUERY, useProductAutocomplete } from "@/hooks/useProductAutocomplete";
import { MAX_ITEM_NAME, money, parsePriceInput, type OrderItemInput } from "@/lib/order-pricing";
import type { OrderItem } from "@/types";
import { updateOrderItems } from "./actions";

/**
 * The price is held as the raw string, not a number: "", "12." and "12,5" are all states a field
 * passes through while being typed, and every one of them is NaN as a number — which is how a
 * half-typed price used to blank the line's subtotal.
 */
type Draft = { id: number; name: string; price: string; quantity: number; image_url: string | null };

type Props = {
  orderId: number;
  items: OrderItem[];
  onCancel: () => void;
  onSaved: (items: OrderItem[], total: number, deliveryCost: number) => void;
};

const toDraft = (item: {
  id: number;
  name: string;
  price: number | null;
  image_url: string | null;
  quantity: number;
}): Draft => ({
  id: item.id,
  name: item.name,
  price: String(item.price ?? ""),
  quantity: item.quantity,
  image_url: item.image_url,
});

const inputClass =
  "border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

export default function OrderItemsEditor({ orderId, items: initial, onCancel, onSaved }: Props) {
  const [items, setItems] = useState<Draft[]>(() => initial.map(toDraft));
  const [query, setQuery] = useState("");
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const { results: suggestions } = useProductAutocomplete(query);
  const results = useMemo(() => suggestions.map((p) => toDraft({ ...p, quantity: 1 })), [suggestions]);

  const close = useCallback(() => setDismissedFor(query), [query]);
  useOutsideClick(boxRef, close);

  const open = query.length >= MIN_QUERY && dismissedFor !== query;

  function addProduct(product: Draft) {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) return prev.map((i) => (i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      return [...prev, product];
    });
    setQuery("");
  }

  function setField(id: number, patch: Partial<Draft>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function setQuantity(id: number, quantity: number) {
    if (quantity < 1) return;
    setField(id, { quantity });
  }

  function removeItem(id: number) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  // Only the lines that currently parse; a price mid-keystroke contributes nothing rather than NaN.
  const itemsTotal = money(items.reduce((sum, i) => sum + (parsePriceInput(i.price) ?? 0) * i.quantity, 0));

  async function handleSave() {
    if (items.length === 0) {
      setError("В заказе должен остаться хотя бы один товар");
      return;
    }
    const payload: OrderItemInput[] = [];
    for (const item of items) {
      const price = parsePriceInput(item.price);
      if (price == null) {
        setError(`Укажите цену числом для «${item.name.trim() || "без названия"}», например 1250`);
        return;
      }
      payload.push({ id: item.id, name: item.name, price, quantity: item.quantity, image_url: item.image_url });
    }

    setSaving(true);
    setError("");
    const result = await updateOrderItems(orderId, payload);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // The server's normalized items, not the draft: trimmed names and rounded prices.
    onSaved(result.items, result.total, result.deliveryCost);
  }

  return (
    <div className="mt-3 border-t border-gray-300 pt-3 space-y-3">
      <div className="space-y-2">
        {items.map((item) => {
          const price = parsePriceInput(item.price);
          return (
            <div key={item.id} className="rounded-lg border border-gray-200 p-2 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={item.name}
                  maxLength={MAX_ITEM_NAME}
                  onChange={(e) => setField(item.id, { name: e.target.value })}
                  aria-label="Название товара"
                  className={`min-w-0 flex-1 ${inputClass}`}
                />
                <Button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  aria-label="Удалить позицию"
                  className="shrink-0 text-red-400 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <div className="flex items-center gap-1 border border-gray-300 rounded shrink-0">
                  <Button
                    type="button"
                    onClick={() => setQuantity(item.id, item.quantity - 1)}
                    aria-label="Меньше"
                    className="px-1.5 py-1 text-gray-500 hover:text-gray-800"
                  >
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className="w-6 text-center">{item.quantity}</span>
                  <Button
                    type="button"
                    onClick={() => setQuantity(item.id, item.quantity + 1)}
                    aria-label="Больше"
                    className="px-1.5 py-1 text-gray-500 hover:text-gray-800"
                  >
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
                <span className="text-gray-400">×</span>
                {/* Not type="number": it scrolls under the wheel, rejects the ru-RU comma, and in
                    some browsers hands back "" for "12." — the very NaN this editor avoids. */}
                <input
                  type="text"
                  inputMode="decimal"
                  value={item.price}
                  onChange={(e) => setField(item.id, { price: e.target.value })}
                  aria-label="Цена"
                  className={`w-24 text-right ${inputClass} ${price == null ? "border-red-300" : ""}`}
                />
                <Currency />
                <span className="ml-auto shrink-0 text-gray-500">
                  {price == null ? (
                    "—"
                  ) : (
                    <>
                      {money(price * item.quantity)} <Currency />
                    </>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div ref={boxRef} className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setDismissedFor(null)}
          placeholder="Добавить товар..."
          className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        {open && results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-sm max-h-56 overflow-y-auto">
            {results.map((p) => (
              <Button
                key={p.id}
                type="button"
                onClick={() => addProduct(p)}
                className="w-full flex justify-between items-center px-3 py-2 text-sm text-left hover:bg-gray-50"
              >
                <span className="line-clamp-1">{p.name}</span>
                <span className="text-gray-500 shrink-0 ml-2">
                  {p.price} <Currency />
                </span>
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500">
          Товары: <span className="font-medium text-gray-800">{itemsTotal}</span> <Currency />
        </p>
        <div className="flex gap-2">
          {error && <span className="text-xs text-red-500 self-center">{error}</span>}
          <Button
            type="button"
            onClick={onCancel}
            className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 inline-flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" /> Отмена
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            {saving ? "Сохраняем..." : "Сохранить"}
          </Button>
        </div>
      </div>
    </div>
  );
}
