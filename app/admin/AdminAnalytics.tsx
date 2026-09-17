"use client";

import { useOptimistic, useTransition } from "react";
import { AlertTriangle, Loader2Icon } from "lucide-react";
import Button from "@/components/Button";
import Currency from "@/components/Currency";
import type { AnalyticsReport, PeriodId } from "@/lib/analytics";
import { ANALYTICS_PERIODS } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { ORDER_STATUS } from "@/lib/constants";
import AnalyticsBarChart from "./AnalyticsBarChart";
import { useAdminListNav } from "./useAdminListNav";

type Props = {
  report: AnalyticsReport;
  period: PeriodId;
  includeCancelled: boolean;
  /** The range held more orders than one request may pull — the numbers cover only the newest. */
  truncated: boolean;
};

function money(value: number): string {
  return Math.round(value).toLocaleString("ru-RU");
}

const SERIES_TITLE: Record<AnalyticsReport["granularity"], string> = {
  day: "Выручка по дням",
  week: "Выручка по неделям",
  month: "Выручка по месяцам",
};

function StatTile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-700">{title}</h2>
      {children}
    </div>
  );
}

/**
 * Ranked rows with the magnitude drawn behind the label. One hue for every row: the length already
 * encodes the value, and shading each bar by its own size would burn the colour channel restating it.
 */
function BarList({ rows }: { rows: Array<{ key: string; label: string; value: string; share: number }> }) {
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

export default function AdminAnalytics({ report, period, includeCancelled, truncated }: Props) {
  const navigate = useAdminListNav({ period: "30" });
  const { customers, freeDelivery } = report;

  // Changing a filter re-renders the page on the server, and a year of orders takes a moment to
  // aggregate. Without a transition the old numbers just sat there under the new button with no sign
  // anything was happening. The filters themselves switch at once (optimistically), the report
  // dims until the new one arrives, and `loading.tsx` stays out of it — it only covers entering the
  // route, not a search-param change within it.
  const [isPending, startTransition] = useTransition();
  const [filters, setFilters] = useOptimistic({ period, includeCancelled });

  function applyFilters(next: Partial<typeof filters>) {
    startTransition(() => {
      setFilters({ ...filters, ...next });
      navigate({
        period: next.period ?? filters.period,
        cancelled: (next.includeCancelled ?? filters.includeCancelled) ? "1" : "",
      });
    });
  }

  // Every order in the period, cancelled ones included — "нет заказов" and "все отменены" are
  // different answers, and `report.orders` counts only what the money is computed over.
  const periodOrders = report.statuses.reduce((sum, status) => sum + status.orders, 0);
  const topProductRevenue = report.topProducts[0]?.revenue ?? 0;
  const categoryRevenue = report.categories[0]?.revenue ?? 0;
  const deliveryOrders = report.delivery[0]?.orders ?? 0;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {ANALYTICS_PERIODS.map((option) => (
          <Button
            key={option.id}
            type="button"
            onClick={() => option.id !== filters.period && applyFilters({ period: option.id })}
            // Disabled until the report lands: a second click mid-flight would start another
            // aggregation and could leave the button and the numbers describing different periods.
            disabled={isPending}
            aria-pressed={option.id === filters.period}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm transition-colors",
              option.id === filters.period
                ? "border-green-600 bg-green-50 font-medium text-green-700"
                : "border-gray-300 text-gray-600 hover:bg-gray-50",
            )}
          >
            {option.label}
          </Button>
        ))}
        <label
          className={cn(
            "ml-auto flex items-center gap-2 text-sm text-gray-600",
            isPending ? "cursor-not-allowed opacity-50" : "cursor-pointer",
          )}
        >
          <input
            type="checkbox"
            disabled={isPending}
            checked={filters.includeCancelled}
            onChange={(e) => applyFilters({ includeCancelled: e.target.checked })}
            className="h-4 w-4 accent-green-600"
          />
          Считать отменённые
        </label>
      </div>

      <div aria-busy={isPending}>
        {/* Fixed to the viewport rather than to the report, so it is in the middle of the screen
            however far down the page the filter was changed from — and outside the dimmed block,
            since opacity is inherited and a half-transparent spinner reads as disabled. */}
        {isPending && (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-gray-600 shadow-lg ring-1 ring-gray-200">
              <Loader2Icon className="size-4 animate-spin text-green-600" />
              Считаем…
            </div>
          </div>
        )}

        <div className={cn("transition-opacity", isPending && "pointer-events-none opacity-50")}>
          {truncated && (
            <p className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              За этот период заказов больше, чем можно посчитать за один раз. Показаны только самые свежие — возьмите
              период короче.
            </p>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Выручка"
              value={
                <>
                  {money(report.revenue)} <Currency />
                </>
              }
              hint={`товары ${money(report.goodsRevenue)} · доставка ${money(report.deliveryRevenue)}`}
            />
            <StatTile label="Заказов" value={report.orders} hint={`${report.itemsSold} товаров продано`} />
            <StatTile
              label="Средний чек"
              value={
                <>
                  {money(report.averageOrder)} <Currency />
                </>
              }
              hint={
                freeDelivery.ofZoned > 0
                  ? `бесплатная доставка: ${Math.round((freeDelivery.free / freeDelivery.ofZoned) * 100)}%`
                  : "бесплатная доставка: —"
              }
            />
            <StatTile
              label="Покупателей"
              value={customers.total}
              hint={`${customers.fresh} новых · ${customers.returning} повторных`}
            />
          </div>

          {periodOrders === 0 ? (
            <p className="rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
              За выбранный период заказов нет.
            </p>
          ) : (
            <div className="space-y-4">
              {report.orders === 0 && (
                <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                  Все заказы за период отменены — включите «Считать отменённые», чтобы увидеть суммы.
                </p>
              )}
              <Card title={SERIES_TITLE[report.granularity]}>
                <AnalyticsBarChart series={report.series} />
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Топ товаров">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                          <th className="pb-2 font-medium">Товар</th>
                          <th className="pb-2 text-right font-medium">Шт.</th>
                          <th className="pb-2 text-right font-medium">Выручка</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.topProducts.map((product) => (
                          <tr key={product.id} className="border-b border-gray-50 last:border-0">
                            <td className="py-1.5 pr-2">
                              <span
                                className="line-clamp-2 text-gray-700"
                                style={{
                                  // A thin share bar behind the name, so the ranking reads without
                                  // comparing five-digit numbers.
                                  backgroundImage: `linear-gradient(to right, #dcfce7 ${
                                    topProductRevenue ? (product.revenue / topProductRevenue) * 100 : 0
                                  }%, transparent 0)`,
                                }}
                              >
                                {product.name}
                              </span>
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-gray-500">{product.quantity}</td>
                            <td className="py-1.5 text-right font-medium tabular-nums text-gray-900">
                              {money(product.revenue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card title="Топ категорий">
                  <BarList
                    rows={report.categories.map((category) => ({
                      key: String(category.id ?? "none"),
                      label: category.name,
                      value: `${money(category.revenue)} с · ${category.quantity} шт.`,
                      share: categoryRevenue ? category.revenue / categoryRevenue : 0,
                    }))}
                  />
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="Доставка">
                  <BarList
                    rows={report.delivery.map((zone) => ({
                      key: zone.id,
                      // The tariff's own labels are whole sentences; the short name is enough here.
                      label: SHORT_ZONE[zone.id] ?? zone.label,
                      value: `${zone.orders} зак. · ${money(zone.revenue)} с`,
                      share: deliveryOrders ? zone.orders / deliveryOrders : 0,
                    }))}
                  />
                </Card>

                <Card title="Статусы заказов">
                  <ul className="space-y-1.5">
                    {Object.entries(ORDER_STATUS).map(([key, { label, cls }]) => {
                      const stat = report.statuses.find((s) => s.id === key);
                      return (
                        <li key={key} className="flex items-center justify-between gap-3 text-sm">
                          <span className={cn("rounded px-2 py-0.5 text-xs font-medium", cls)}>{label}</span>
                          <span className="tabular-nums text-gray-500">
                            {stat?.orders ?? 0} зак. · {money(stat?.revenue ?? 0)} <Currency />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-3 text-xs text-gray-500">
                    Гостевых заказов (без аккаунта): {customers.guestOrders} из {report.orders}. В среднем{" "}
                    {customers.ordersPer} зак. на покупателя.
                  </p>
                </Card>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** The delivery tariff's labels list every district; a breakdown needs the zone's name, not its scope. */
const SHORT_ZONE: Record<string, string> = {
  center: "Центр Бишкека",
  residential: "Жилмассивы",
  regions: "Регионы",
  urgent: "Срочно (Яндекс)",
  unknown: "Не указана",
};
