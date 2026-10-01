import { cn } from "@/lib/cn";
import Title, { TitleProps } from "./Title";

type TitleWithCountProps = TitleProps & {
  count?: number;
  isBrands?: boolean;
  titleClassname?: string;
};

export default function TitleWithCount({
  children,
  count,
  isBrands = false,
  className,
  titleClassname,
}: TitleWithCountProps) {
  return (
    <div className={cn("flex items-baseline gap-3 mb-6", className)}>
      <Title className={titleClassname}>{children}</Title>
      {count ? (
        <span className="hidden md:inline text-sm text-gray-500">
          {count} {isBrands ? "производителей" : "товаров"}
        </span>
      ) : null}
    </div>
  );
}
