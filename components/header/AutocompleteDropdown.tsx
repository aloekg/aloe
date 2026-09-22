"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import Button from "../Button";
import Currency from "../Currency";

export type AutocompleteProduct = {
  id: number;
  name: string;
  price: number | null;
  image_url: string | null;
  thumbnail_url: string | null;
  category_id: number | null;
};

export default function AutocompleteDropdown({
  results,
  loading,
  onSelect,
}: {
  results: AutocompleteProduct[];
  loading: boolean;
  onSelect: () => void;
}) {
  const router = useRouter();

  if (loading) return null;

  if (results.length === 0) {
    return (
      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 px-4 py-3 text-sm text-gray-500">
        Ничего не найдено
      </div>
    );
  }

  return (
    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 overflow-hidden">
      {results.map((p) => (
        <Button
          key={p.id}
          onClick={() => {
            // Same intercepted modal as ProductCard — see the note there on `scroll: false`.
            router.push(`/product/${p.id}`, { scroll: false });
            onSelect();
          }}
          className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 text-left"
        >
          <div className="relative w-10 h-10 shrink-0 bg-gray-100 rounded">
            <Image
              src={p.thumbnail_url || p.image_url || ""}
              alt={p.name}
              fill
              sizes="40px"
              className="object-contain p-1"
              unoptimized
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm truncate">{p.name}</p>
            <p className="text-xs text-green-600 font-medium">
              {p.price} <Currency />
            </p>
          </div>
        </Button>
      ))}
      <Button
        type="submit"
        variant="ghost"
        className="w-full px-4 py-2 text-sm font-medium hover:bg-gray-50 border-t border-gray-300 text-center"
      >
        Показать все результаты →
      </Button>
    </div>
  );
}
