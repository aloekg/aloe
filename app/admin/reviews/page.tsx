import { requireAdmin } from "@/lib/auth";
import { parsePage } from "@/lib/page-params";
import { reviewTabFilter, reviewTabFromParam } from "@/lib/reviews";
import { createAdminClient } from "@/lib/supabase-admin";
import { getAdminReviews, getReviewStatusCounts } from "@/services/review.service";
import AdminReviews from "../AdminReviews";

export const metadata = { title: "Отзывы" };

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const page = parsePage(sp.page);

  // Both the highlight and the filter come from the same function — see reviewTabFromParam for the
  // bug that is.
  const tab = reviewTabFromParam(sp.status);
  const status = reviewTabFilter(tab);

  const admin = createAdminClient();
  const [{ reviews, total }, counts] = await Promise.all([
    getAdminReviews(admin, { status, page }),
    getReviewStatusCounts(admin),
  ]);

  return <AdminReviews reviews={reviews} total={total} page={page} status={tab} counts={counts} />;
}
