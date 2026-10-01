"use client";

import { useState } from "react";
import { X } from "lucide-react";
import Button from "@/components/Button";
import Currency from "@/components/Currency";
import { DELIVERY_OPTIONS, deliveryFreeNote, getDeliveryCost } from "@/lib/constants";
import { isManualDeliveryCost, parsePriceInput } from "@/lib/order-pricing";
import { updateOrderDelivery } from "./actions";

type Props = {
  orderId: number;
  deliveryType: string | null;
  deliveryCost: number;
  itemsTotal: number;
  onCancel: () => void;
  onSaved: (deliveryType: string, deliveryCost: number, total: number) => void;
};

export default function OrderDeliveryEditor({
  orderId,
  deliveryType,
  deliveryCost,
  itemsTotal,
  onCancel,
  onSaved,
}: Props) {
  const [type, setType] = useState(deliveryType ?? DELIVERY_OPTIONS[0].id);
  const [manual, setManual] = useState(() => isManualDeliveryCost(deliveryCost, deliveryType, itemsTotal));
  const [cost, setCost] = useState(String(deliveryCost || ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const tariff = getDeliveryCost(type, itemsTotal);

  function toggleManual(next: boolean) {
    setManual(next);
    if (next && !parsePriceInput(cost)) setCost(String(deliveryCost || tariff));
  }

  async function handleSave() {
    let override: number | null = null;
    if (manual) {
      override = parsePriceInput(cost);
      if (override == null) {
        setError("Укажите стоимость доставки числом");
        return;
      }
    }

    setSaving(true);
    setError("");
    const result = await updateOrderDelivery(orderId, type, override);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.deliveryType, result.deliveryCost, result.total);
  }

  return (
    <div className="my-1.5 space-y-2 rounded-lg border border-gray-200 p-2">
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        aria-label="Способ доставки"
        className="w-full border border-gray-500 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
      >
        {DELIVERY_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input
          type="checkbox"
          checked={manual}
          onChange={(e) => toggleManual(e.target.checked)}
          className="accent-green-600"
        />
        Указать стоимость вручную
      </label>

      {manual ? (
        <div className="flex items-center gap-2 text-sm">
          <input
            type="text"
            inputMode="decimal"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            aria-label="Стоимость доставки"
            className="w-24 text-right border border-gray-500 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
          />
          <Currency />
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          Рассчитано:{" "}
          {tariff > 0 ? (
            <>
              {tariff} <Currency />
            </>
          ) : (
            deliveryFreeNote(type)
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {error && <span className="mr-auto text-xs text-red-600">{error}</span>}
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
          className="text-xs px-3 py-1.5 bg-green-700 text-white rounded-lg hover:bg-green-800"
        >
          {saving ? "Сохраняем..." : "Сохранить"}
        </Button>
      </div>
    </div>
  );
}
