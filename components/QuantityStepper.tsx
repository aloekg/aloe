"use client";

import { useEffect, useRef } from "react";
import { MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Button from "./Button";

type Props = {
  quantity: number;
  onDecrement: () => void;
  onIncrement: () => void;
  label: string;
  size?: "sm" | "md" | "lg";
  variant?: "plain" | "pill";
  // Only for when this replaces the pressed button; elsewhere it would steal focus on page load.
  focusIncrementOnMount?: boolean;
};

export default function QuantityStepper({
  quantity,
  onDecrement,
  onIncrement,
  label,
  size = "md",
  variant = "plain",
  focusIncrementOnMount = false,
}: Props) {
  const incrementRef = useRef<HTMLButtonElement>(null);
  const atMinimum = quantity === 1;

  // Mount only: re-running would pull focus back on every quantity change.
  useEffect(() => {
    if (focusIncrementOnMount) incrementRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rounded = variant === "pill" ? "rounded-full" : "border border-gray-300 rounded-lg";

  return (
    <div
      className={`flex items-center shrink-0 ${
        variant === "pill" ? "gap-1 md:gap-2 rounded-full bg-gray-200" : "justify-between gap-2"
      }`}
    >
      <Button
        variant="icon"
        size={size}
        onClick={onDecrement}
        aria-label={atMinimum ? `Удалить ${label} из корзины` : `Уменьшить количество: ${label}`}
        className={`${rounded} font-bold ${variant === "plain" ? "hover:bg-gray-50" : ""}`}
      >
        {atMinimum ? <Trash2Icon className="size-4" /> : <MinusIcon className="size-4" />}
      </Button>

      <span
        className={`${size === "lg" ? "text-base" : "text-sm"} font-medium text-center whitespace-nowrap ${
          variant === "pill" ? "w-6" : "w-6"
        }`}
      >
        {variant === "pill" ? quantity : `${quantity} шт`}
      </span>

      <Button
        ref={incrementRef}
        variant="icon"
        size={size}
        onClick={onIncrement}
        aria-label={`Увеличить количество: ${label}`}
        className={`${rounded} font-bold ${variant === "plain" ? "hover:bg-gray-50" : ""}`}
      >
        <PlusIcon className="size-4" />
      </Button>
    </div>
  );
}
