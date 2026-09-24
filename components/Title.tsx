import { cn } from "@/lib/cn";

export type TitleProps = {
  children: React.ReactNode;
  className?: string;
  /**
   * `h1` on a page. A form that also renders inside a dialog on top of another page passes `h2`:
   * the sign-in sheet is mounted in the root layout, and its "Вход" used to be a second h1 on
   * whatever page it opened over.
   */
  as?: "h1" | "h2";
};

export default function Title({ children, className, as: Tag = "h1" }: TitleProps) {
  return <Tag className={cn("text-xl md:text-2xl font-medium md:font-bold", className)}>{children}</Tag>;
}
