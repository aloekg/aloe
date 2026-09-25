import { cn } from "@/lib/cn";

export type TitleProps = {
  children: React.ReactNode;
  className?: string;
  as?: "h1" | "h2";
};

export default function Title({ children, className, as: Tag = "h1" }: TitleProps) {
  return <Tag className={cn("text-xl md:text-2xl font-medium md:font-bold", className)}>{children}</Tag>;
}
