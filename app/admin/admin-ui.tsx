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
  /** Optional control rendered on the label row, right-aligned — e.g. an "insert image" button. */
  action?: React.ReactNode;
  /**
   * Called with the id to put on the control, so the caption can be a real `<label htmlFor>`. It
   * used to be a plain `<label>` beside an input with no id, not wrapping it either, which named
   * nothing — and since this component backs every form in the admin, that was one bug repeated
   * twenty times.
   *
   * Pass a plain node instead where there is no single control to point at — the category image
   * field, whose only input is a hidden `type="file"` driven by buttons. The caption then renders
   * as a `<span>`: a `<label>` pointing at nothing is worse than none, because a screen reader
   * announces it as a label and it still never reaches a control.
   */
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
