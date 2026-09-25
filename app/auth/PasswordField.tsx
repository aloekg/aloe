"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = {
  label: string;
  name: "password" | "confirm-password";
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  error?: string;
  children?: React.ReactNode;
};

export default function PasswordField({
  label,
  name,
  value,
  onChange,
  autoComplete,
  placeholder,
  error,
  children,
}: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="text-sm text-gray-600 block mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(error && errorId, children && hintId) || undefined}
          placeholder={placeholder}
          // text-base, not text-sm: below 16px iOS Safari zooms the viewport on focus.
          className={cn(
            "w-full border rounded-lg pl-3 pr-11 py-2 text-base md:text-sm focus:outline-none focus:ring-2",
            error ? "border-red-500 focus:ring-red-600" : "border-gray-500 focus:ring-green-700",
          )}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-gray-500 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700 cursor-pointer"
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
      {children && <div id={hintId}>{children}</div>}
    </div>
  );
}
