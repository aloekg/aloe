import {
  buildReport,
  firstOrderDays,
  parsePeriod,
  periodRange,
  previousRange,
  shopDay,
  summarizePeriod,
} from "@/lib/analytics";
import { buildCatalogueIndex, buildInsights } from "@/lib/analytics-insights";
import { requireAdmin } from "@/lib/auth";
import {
  loadAnalyticsOrders,
  loadCatalogue,
  loadCustomerHistory,
  loadFavoriteCounts,
} from "@/services/analytics.service";
import AdminAnalytics from "../AdminAnalytics";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { db: supabase } = await requireAdmin();
  const sp = await searchParams;

  const period = parsePeriod(sp.period);
  const includeCancelled = sp.cancelled === "1";
  const { fromDay, toDay } = periodRange(period);
  const previous = previousRange(period, fromDay);

  const [{ rows: allRows, truncated }, history, catalogue, favoriteCounts] = await Promise.all([
    loadAnalyticsOrders(supabase, { fromDay: previous?.fromDay ?? fromDay, toDay }),
    loadCustomerHistory(supabase),
    loadCatalogue(supabase),
    loadFavoriteCounts(supabase),
  ]);

  const rows = fromDay ? allRows.filter((row) => shopDay(row.created_at) >= fromDay) : allRows;
  const previousRows = fromDay ? allRows.filter((row) => shopDay(row.created_at) < fromDay) : [];

  const report = buildReport({
    rows,
    fromDay,
    toDay,
    includeCancelled,
    firstOrderByCustomer: firstOrderDays(history),
  });

  const insights = buildInsights({
    rows,
    fromDay,
    toDay,
    includeCancelled,
    history,
    catalogue: buildCatalogueIndex(catalogue.products, catalogue.categories, catalogue.brands),
    favoriteCounts,
  });

  return (
    <AdminAnalytics
      report={report}
      insights={insights}
      // A truncated fetch drops the previous period's rows first, so no comparison then.
      previous={previous && !truncated ? summarizePeriod(previousRows, includeCancelled) : null}
      period={period}
      includeCancelled={includeCancelled}
      truncated={truncated}
    />
  );
}
