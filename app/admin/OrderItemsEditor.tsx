"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Minus, Plus, Search, Trash2, X } from "lucide-react";
import Button from "@/components/Button";
import Currency from "@/components/Currency";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { MIN_QUERY, useProductAutocomplete } from "@/hooks/useProductAutocomplete";
import { updateOrderItems, type OrderItemInput } from "./actions";

type Props = {
  orderId: number;
  items: OrderItemInput[];
  onCancel: () => void;
  onSaved: (items: OrderItemInput[], total: number) => void;
};

export default function OrderItemsEditor({ orderId, items: initial, onCancel, onSaved }: Props) {
  const [items, setItems] = useState<OrderItemInput[]>(initial);
  const [query, setQuery] = useState("");
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const { results: suggestions } = useProductAutocomplete(query);
  const results: OrderItemInput[] = useMemo(
    () => suggestions.map((p) => ({ id: p.id, name: p.name, price: p.price, quantity: 1, image_url: p.image_url })),
    [suggestions],
  );

  const close = useCallback(() => setDismissedFor(query), [query]);
  useOutsideClick(boxRef, close);

  const open = query.length >= MIN_QUERY && dismissedFor !== query;

  function addProduct(product: OrderItemInput) {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) return prev.map((i) => (i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      return [...prev, product];
    });
    setQuery("");
  }

  function setQuantity(id: number, quantity: number) {
    if (quantity < 1) return;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity } : i)));
  }

  function removeItem(id: number) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const itemsTotal = items.reduce((sum, i) => sum + (i.price ?? 0) * i.quantity, 0);

  async function handleSave() {
    if (items.length === 0) {
      setError("В заказе должен остаться хотя бы один товар");
      return;
    }
    setSaving(true);
    setError("");
    const result = await updateOrderItems(orderId, items);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(items, result.total);
  }

  return (
    <div className="mt-3 border-t border-gray-300 pt-3 space-y-3">
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2 text-sm">
            <span className="flex-1 line-clamp-1">{item.name}</span>
            <div className="flex items-center gap-1 border border-gray-300 rounded shrink-0">
              <Button
                type="button"
                onClick={() => setQuantity(item.id, item.quantity - 1)}
                className="px-1.5 py-1 text-gray-500 hover:text-gray-800"
              >
                <Minus className="w-3 h-3" />
              </Button>
              <span className="w-6 text-center">{item.quantity}</span>
              <Button
                type="button"
                onClick={() => setQuantity(item.id, item.quantity + 1)}
                className="px-1.5 py-1 text-gray-500 hover:text-gray-800"
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
            <span className="text-gray-500 shrink-0 w-20 text-right">
              {(item.price ?? 0) * item.quantity} <Currency />
            </span>
            <Button type="button" onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
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

      <div className="flex items-center justify-between">
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
