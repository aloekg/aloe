"use client";

import { useId } from "react";

export const adminInputCls =
  "w-full border border-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700";

export function Field({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode | ((id: string) => React.ReactNode);
}) {
  const id = useId();
  const captionCls = "block text-xs font-medium text-gray-600";
  const labelled = typeof children === "function";

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        {labelled ? (
          <label htmlFor={id} className={captionCls}>
            {label}
          </label>
        ) : (
          <span className={captionCls}>{label}</span>
        )}
        {action}
      </div>
      {labelled ? children(id) : children}
    </div>
  );
}
