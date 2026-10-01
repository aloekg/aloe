import Currency from "./Currency";

// Keep the sr-only caption: most screen readers announce neither <s> nor a CSS strike-through.
export default function OldPrice({ value, className = "" }: { value: number; className?: string }) {
  return (
    <s className={`line-through ${className}`}>
      <span className="sr-only">Старая цена: </span>
      {value} <Currency />
    </s>
  );
}
