"use client";

import { Search, X } from "lucide-react";
import Button from "@/components/Button";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
};

export default function ProductSearchBar({ value, onChange, onClear }: Props) {
  return (
    <div className="relative mb-4">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Поиск по названию или ID..."
        className="w-full border border-gray-500 rounded-lg pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
      />
      {value && (
        <Button
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600"
        >
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
