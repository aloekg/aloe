"use client";

import { useEffect, useRef } from "react";
import { MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Button from "./Button";

type Props = {
  quantity: number;
  onDecrement: () => void;
  onIncrement: () => void;
  /** Product name, used for the buttons' accessible names. */
  label: string;
  size?: "sm" | "md" | "lg";
  /** Cart page uses a filled pill; the product card sits on plain background. */
  variant?: "plain" | "pill";
  /**
   * Put focus on "+" as soon as this mounts. AddToCart passes it when the press on "В корзину" is
   * what swapped that button out for this control: the pressed element is unmounted mid-interaction
   * and focus falls back to <body>, which drops a keyboard user out of a grid of forty products and
   * back to the top of the page. Left unset everywhere the stepper is simply rendered, so nothing
   * steals focus from a page the visitor has just opened.
   */
  focusIncrementOnMount?: boolean;
};

/**
 * Shared −/quantity/+ control. At quantity 1 the decrement button becomes a delete, which is why
 * the two former copies (AddToCart and the cart page) had to agree on the same small rule.
 */
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

  // Mount only: re-running it on later renders would pull focus back every time the quantity moves.
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
