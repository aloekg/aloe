"use client";

import { cn } from "@/lib/cn";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "icon";
  size?: "sm" | "md" | "lg";
  iconColor?: "default" | "danger" | "green";
};

export default function Button({
  variant,
  size = "md",
  iconColor = "default",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "primary" && [
          "bg-green-700 hover:bg-green-800 disabled:hover:bg-green-700 text-white font-medium rounded-lg transition-colors",
          size === "sm" && "px-3 py-1.5 text-xs",
          size === "md" && "px-4 py-1.5 text-sm",
          size === "lg" && "px-4 py-2.5 text-base",
        ],
        variant === "secondary" && [
          "border border-gray-300 text-gray-500 hover:bg-gray-50 rounded-lg",
          size === "sm" && "px-3 py-1.5 text-xs",
          size === "md" && "px-4 py-1.5 text-sm",
          size === "lg" && "px-4 py-2.5 text-base",
        ],
        variant === "ghost" && [
          "text-green-700 hover:text-green-700 hover:underline",
          size === "sm" && "text-xs",
          size === "md" && "text-sm",
          size === "lg" && "text-base",
        ],
        variant === "icon" && [
          "flex items-center justify-center rounded transition-colors",
          size === "sm" && "w-7 h-7",
          size === "md" && "w-8 h-8",
          size === "lg" && "w-10 h-10",
          iconColor === "default" && "text-gray-500 hover:bg-gray-200 hover:text-gray-700",
          iconColor === "danger" && "text-gray-500 hover:bg-red-100 hover:text-red-600",
          iconColor === "green" && "text-gray-500 hover:bg-green-100 hover:text-green-700",
        ],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
