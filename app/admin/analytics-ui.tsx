import { ArrowDownRight, ArrowUpRight } from "lucide-react";

/** Building blocks shared by the analytics cards — kept here so each card stays about its data. */

export function money(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

export function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

/** The delivery tariff's labels list every district; a breakdown needs the zone's name, not its scope. */
export const SHORT_ZONE: Record<string, string> = {
  center: "Центр Бишкека",
  residential: "Жилмассивы",
  regions: "Регионы",
  urgent: "Срочно (Яндекс)",
  unknown: "Не указана",
};

export function Card({
  title,
  note,
  children,
}: {
  title: string;
  /** One line under the title for the caveat a reader needs before trusting the numbers. */
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-gray-500">{note}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-sm text-gray-400">{children}</p>;
}

/**
 * Change against the previous period. The arrow carries the direction and the words carry the
 * number, so the colour is never the only thing saying "better" or "worse".
 */
function Delta({ current, previous, caption }: { current: number; previous: number; caption: string }) {
  if (previous === 0) {
    return <span className="text-gray-500">{current > 0 ? `в прошлом периоде 0` : `без изменений ${caption}`}</span>;
  }
  const change = (current - previous) / previous;
  const rounded = Math.round(change * 100);
  if (rounded === 0) return <span className="text-gray-500">без изменений {caption}</span>;

  const up = rounded > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={up ? "text-green-700" : "text-red-700"}>
      <Icon className="-mt-0.5 inline size-3.5" aria-hidden />
      {up ? "+" : "−"}
      {Math.abs(rounded)}% <span className="text-gray-500">{caption}</span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
  comparison,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  comparison?: { current: number; previous: number; caption: string } | null;
}) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{value}</div>
      {comparison && (
        <div className="mt-1 text-xs tabular-nums">
          <Delta {...comparison} />
        </div>
      )}
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}

/**
 * Ranked rows with the magnitude drawn behind the label. One hue for every row: the length already
 * encodes the value, and shading each bar by its own size would burn the colour channel restating it.
 */
export function BarList({ rows }: { rows: Array<{ key: string; label: string; value: string; share: number }> }) {
  return (
    <ul className="space-y-1.5">
      {rows.map((row) => (
        <li key={row.key} className="relative overflow-hidden rounded-md px-2 py-1.5">
          <div
            className="absolute inset-y-0 left-0 rounded-md bg-green-50"
            style={{ width: `${Math.max(2, row.share * 100)}%` }}
          />
          <div className="relative flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-gray-700">{row.label}</span>
            <span className="shrink-0 font-medium text-gray-900 tabular-nums">{row.value}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A compact product list: name on the left, a couple of numbers on the right. */
export function ProductTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<{ key: string | number; name: string; cells: React.ReactNode[] }>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
            <th className="pb-2 font-medium">Товар</th>
            {columns.map((column) => (
              <th key={column} className="pb-2 pl-3 text-right font-medium whitespace-nowrap">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-gray-50 last:border-0">
              <td className="py-1.5 pr-2">
                <span className="line-clamp-2 text-gray-700">{row.name}</span>
              </td>
              {row.cells.map((cell, index) => (
                <td key={index} className="py-1.5 pl-3 text-right tabular-nums text-gray-900">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
