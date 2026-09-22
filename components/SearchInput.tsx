"use client";

import { LoaderCircle, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";

export type SearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  searchPath: string;
  loading?: boolean;
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
};

export default function SearchInput({ value, onChange, searchPath, loading, inputProps }: SearchBarProps) {
  const router = useRouter();

  function handleClear() {
    onChange("");
    router.push(searchPath);
  }

  return (
    <div className="relative w-full">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-500 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder="Я ищу..."
        className={`w-full md:border md:border-gray-500 rounded-lg pl-9 py-2 text-base md:text-sm focus:outline-none focus:border-green-700 ${value ? "pr-8" : "pr-4"}`}
        {...inputProps}
      />
      {value && !loading && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Очистить"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600 transition-colors"
        >
          <X className="size-4" />
        </button>
      )}
      {loading ? (
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-600 transition-colors">
          <LoaderCircle className="animate-spin size-4" />
        </div>
      ) : null}
    </div>
  );
}
