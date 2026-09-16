export const adminInputCls =
  "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

export function Field({
  label,
  action,
  children,
}: {
  label: string;
  /** Optional control rendered on the label row, right-aligned — e.g. an "insert image" button. */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <label className="block text-xs font-medium text-gray-600">{label}</label>
        {action}
      </div>
      {children}
    </div>
  );
}
