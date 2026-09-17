"use client";

import { useOptimistic, useTransition } from "react";
import { AlertTriangle, Loader2Icon } from "lucide-react";
import Button from "@/components/Button";
import Currency from "@/components/Currency";
import type { AnalyticsReport, PeriodId, PeriodSummary } from "@/lib/analytics";
import { ANALYTICS_PERIODS } from "@/lib/analytics";
import type { AnalyticsInsights } from "@/lib/analytics-insights";
import { cn } from "@/lib/cn";
import { ORDER_STATUS } from "@/lib/constants";
import { BarList, Card, money, percent, SHORT_ZONE, StatTile } from "./analytics-ui";
import AnalyticsBarChart from "./AnalyticsBarChart";
import AnalyticsHeatmap from "./AnalyticsHeatmap";
import {
  BrandsCard,
  CancellationsCard,
  CategoriesCard,
  FavoritesCard,
  PromoCard,
  RepeatCard,
  ThresholdCard,
  UnsoldCard,
} from "./AnalyticsInsightCards";
import { useAdminListNav } from "./useAdminListNav";

type Props = {
  report: AnalyticsReport;
  insights: AnalyticsInsights;
  /** The same numbers for the period before this one; null for "всё время" or a truncated fetch. */
  previous: PeriodSummary | null;
  period: PeriodId;
  includeCancelled: boolean;
  /** The range held more orders than one request may pull — the numbers cover only the newest. */
  truncated: boolean;
};

const SERIES_TITLE: Record<AnalyticsReport["granularity"], string> = {
  day: "Выручка по дням",
  week: "Выручка по неделям",
  month: "Выручка по месяцам",
};

const COMPARE_CAPTION: Partial<Record<PeriodId, string>> = {
  "7": "к прошлым 7 дням",
  "30": "к прошлым 30 дням",
  "90": "к прошлым 90 дням",
  "365": "к прошлому году",
};

export default function AdminAnalytics({ report, insights, previous, period, includeCancelled, truncated }: Props) {
  const navigate = useAdminListNav({ period: "30" });
  const { customers, freeDelivery } = report;

  // Changing a filter re-renders the page on the server, and a year of orders takes a moment to
  // aggregate. The filters switch at once (optimistically), the report dims under a loader until
  // the new one arrives, and `loading.tsx` stays out of it — it only covers entering the route, not
  // a search-param change within it.
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
  const deliveryOrders = report.delivery[0]?.orders ?? 0;

  const caption = COMPARE_CAPTION[period];
  const compare = (current: number, pick: (p: PeriodSummary) => number) =>
    previous && caption ? { current, previous: pick(previous), caption } : null;

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
              За этот период заказов больше, чем можно посчитать за один раз. Показаны только самые свежие, сравнение с
              прошлым периодом отключено — возьмите период короче.
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
              comparison={compare(report.revenue, (p) => p.revenue)}
              hint={`товары ${money(report.goodsRevenue)} · доставка ${money(report.deliveryRevenue)}`}
            />
            <StatTile
              label="Заказов"
              value={report.orders}
              comparison={compare(report.orders, (p) => p.orders)}
              hint={`${report.itemsSold} товаров продано`}
            />
            <StatTile
              label="Средний чек"
              value={
                <>
                  {money(report.averageOrder)} <Currency />
                </>
              }
              comparison={compare(report.averageOrder, (p) => p.averageOrder)}
              hint={`бесплатная доставка: ${percent(freeDelivery.free, freeDelivery.ofZoned)}`}
            />
            <StatTile
              label="Покупателей"
              value={customers.total}
              comparison={compare(customers.total, (p) => p.customers)}
              hint={`${customers.fresh} новых · ${customers.returning} повторных`}
            />
          </div>

          {periodOrders === 0 ? (
            <div className="space-y-4">
              <p className="rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
                За выбранный период заказов нет.
              </p>
              {/* Still worth showing with no sales: it is the list of what did not sell. */}
              <UnsoldCard insights={insights} />
            </div>
          ) : (
            <div className="space-y-4">
              {report.orders === 0 && (
                <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                  Все заказы за период отменены — включите «Считать отменённые», чтобы увидеть суммы.
                </p>
              )}

              <Card title={SERIES_TITLE[report.granularity]}>
                <AnalyticsBarChart
                  points={report.series.map((point) => ({
                    key: point.bucket,
                    label: point.label,
                    value: point.revenue,
                    detail: `${point.revenue.toLocaleString("ru-RU")} с · ${point.orders} зак.`,
                  }))}
                />
              </Card>

              <Card title="Когда заказывают" note="Время по Бишкеку">
                <AnalyticsHeatmap heatmap={insights.heatmap} />
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
                <CategoriesCard insights={insights} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <BrandsCard insights={insights} />
                <PromoCard insights={insights} />
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

              <ThresholdCard insights={insights} />

              <div className="grid gap-4 lg:grid-cols-2">
                <CancellationsCard insights={insights} />
                <RepeatCard insights={insights} />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <FavoritesCard insights={insights} />
                <UnsoldCard insights={insights} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
