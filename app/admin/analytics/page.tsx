import { buildReport, firstOrderDays, parsePeriod, periodRange } from "@/lib/analytics";
import { requireAdmin } from "@/lib/auth";
import { loadAnalyticsOrders, loadCustomerHistory, loadProductCategories } from "@/services/analytics.service";
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

  const [{ rows, truncated }, history] = await Promise.all([
    loadAnalyticsOrders(supabase, { fromDay, toDay }),
    loadCustomerHistory(supabase),
  ]);

  // Only the products that actually sold in the period — the category lookup is by id, so this is
  // at most a few hundred rows however large the catalogue is.
  const soldProductIds = [...new Set(rows.flatMap((row) => (row.items ?? []).map((item) => item.id)))];
  const categoryOf = await loadProductCategories(supabase, soldProductIds);

  const report = buildReport({
    rows,
    fromDay,
    toDay,
    includeCancelled,
    firstOrderByCustomer: firstOrderDays(history),
    categoryOf,
  });

  return <AdminAnalytics report={report} period={period} includeCancelled={includeCancelled} truncated={truncated} />;
}
