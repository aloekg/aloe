"use client";

import { useState } from "react";
import { ORDER_STATUS } from "@/lib/constants";
import { updateOrderStatus } from "./actions";

const STATUSES = Object.entries(ORDER_STATUS).map(([value, { label }]) => ({ value, label }));

export default function OrderStatusSelect({
  orderId,
  currentStatus,
  onStatusChange,
}: {
  orderId: number;
  currentStatus: string;
  onStatusChange?: (orderId: number, status: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setSaving(true);
    setError(false);
    try {
      await updateOrderStatus(orderId, next);
      onStatusChange?.(orderId, next);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {saving && <span className="text-xs text-gray-500">сохраняем...</span>}
      {error && <span className="text-xs text-red-600">ошибка</span>}
      <select
        value={currentStatus}
        onChange={handleChange}
        disabled={saving}
        className="text-xs border border-gray-500 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-green-700"
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
