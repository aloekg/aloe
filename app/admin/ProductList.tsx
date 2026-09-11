"use client";

import { Pencil, Trash2 } from "lucide-react";
import Image from "next/image";
import Button from "@/components/Button";
import Currency from "@/components/Currency";
import type { ProductRecord } from "@/types";

type Props = {
  products: ProductRecord[];
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  onEdit: (product: ProductRecord) => void;
  onDelete: (id: number) => void;
};

export default function ProductList({ products, selectedIds, onToggle, onToggleAll, onEdit, onDelete }: Props) {
  if (products.length === 0) {
    return <p className="text-sm text-gray-400 py-6 text-center">Ничего не найдено</p>;
  }

  const allSelected = products.every((p) => selectedIds.has(p.id));

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 px-3 py-1 text-xs text-gray-500 cursor-pointer select-none">
        <input type="checkbox" checked={allSelected} onChange={onToggleAll} className="w-4 h-4 accent-green-600" />
        Выбрать все
      </label>
      {products.map((p) => (
        <div key={p.id} className="flex items-center gap-3 border border-gray-200 rounded-lg p-3 hover:bg-gray-50">
          <input
            type="checkbox"
            checked={selectedIds.has(p.id)}
            onChange={() => onToggle(p.id)}
            className="w-4 h-4 shrink-0 accent-green-600"
          />
          <div className="relative w-12 h-12 shrink-0 bg-gray-100 rounded overflow-hidden">
            {(p.thumbnail_url || p.image_url) && (
              <Image
                src={p.thumbnail_url || p.image_url!}
                alt={p.name}
                fill
                sizes="48px"
                className="object-contain p-1"
                unoptimized
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium truncate">{p.name}</p>
              {!p.published && (
                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                  Скрыт
                </span>
              )}
              {/* Not cosmetic: such a product cannot be published at all — the
                  products_published_has_category CHECK rejects it — so the row has to say why. */}
              {!p.category_id && (
                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                  Без категории
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">
              {p.category} · {p.price} <Currency />
              {p.old_price ? ` (было ${p.old_price})` : ""} · продано {p.purchase_count}
            </p>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button variant="icon" onClick={() => onEdit(p)}>
              <Pencil className="w-4 h-4" />
            </Button>
            <Button variant="icon" iconColor="danger" onClick={() => onDelete(p.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
