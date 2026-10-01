import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export default function SeeAllProducts({
  count,
  href,
  className,
}: {
  href: string;
  count: number;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("flex items-center gap-1 text-sm text-gray-500 hover:text-green-700 transition-colors", className)}
    >
      {count > 0 ? <>+{count} ещё</> : <>Перейти в раздел</>}
      <ChevronRightIcon className="w-4 h-4" />
    </Link>
  );
}
