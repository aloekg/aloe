import Currency from "./Currency";

/**
 * The price a product used to cost, struck through.
 *
 * It exists as a component because `line-through` is styling and nothing more: the two prices sat
 * side by side as plain numbers, so a screen reader read "450 сом 600 сом" and left it to the
 * listener to guess which one the shop is asking for. `<s>` puts that meaning in the markup, and
 * the visually hidden caption says it outright — most screen readers announce neither `<s>` nor a
 * CSS strike-through by default, so the element alone would not have been enough.
 */
export default function OldPrice({ value, className = "" }: { value: number; className?: string }) {
  return (
    <s className={`line-through ${className}`}>
      <span className="sr-only">Старая цена: </span>
      {value} <Currency />
    </s>
  );
}
