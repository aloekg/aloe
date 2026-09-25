import { InstallAppIos, MainContainer, MobileHeader, Title } from "@/components";
import { requireAuth } from "@/lib/auth";
import { parsePage } from "@/lib/page-params";
import { createAdminClient } from "@/lib/supabase-admin";
import { getUserOrders } from "@/services/order.service";
import { getProfile } from "@/services/profile.service";
import { getUserReviews } from "@/services/review.service";
import LogoutButton from "./LogoutButton";
import ProfileTabs from "./ProfileTabs";

export const metadata = { title: "Профиль", robots: { index: false, follow: true } };

const ORDERS_PAGE_SIZE = 10;

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { supabase, user } = await requireAuth();
  const page = parsePage((await searchParams).page);

  const hasPassword =
    user.identities?.some((identity) => identity.provider === "email") ??
    (user.app_metadata?.providers as string[] | undefined)?.includes("email") ??
    false;

  const [{ orders, total }, profile, reviews] = await Promise.all([
    getUserOrders(supabase, user.id, { page, pageSize: ORDERS_PAGE_SIZE }),
    getProfile(supabase, user.id),
    // Service role with the session's own id: the user's client cannot read reviews.user_id.
    getUserReviews(createAdminClient(), user.id),
  ]);

  const registeredAt = new Date(user.created_at).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <MobileHeader title="Мой профиль">
        <span className="absolute right-4">
          <LogoutButton />
        </span>
      </MobileHeader>
      <MainContainer className="max-w-2xl">
        <Title className="hidden md:block mb-6">Мой профиль</Title>

        <div className="flex md:hidden flex-col items-center gap-2 mb-6 text-center">
          <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-lg shrink-0">
            {user.email?.[0].toUpperCase()}
          </div>
          {profile?.name && <h2 className="text-3xl">{profile.name}</h2>}
          <p className="font-medium break-all">{user.email}</p>
          <p className="text-sm text-gray-500">Зарегистрирован: {registeredAt}</p>
        </div>

        <div className="hidden md:flex border border-gray-300 rounded-xl p-5 mb-6 items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-lg shrink-0">
            {user.email?.[0].toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="font-medium">{user.email}</p>
            <p className="text-sm text-gray-500">Зарегистрирован: {registeredAt}</p>
          </div>
          <LogoutButton />
        </div>

        <InstallAppIos className="mb-6" />

        <ProfileTabs
          initial={profile}
          orders={orders}
          page={page}
          totalPages={Math.ceil(total / ORDERS_PAGE_SIZE)}
          totalOrders={total}
          reviews={reviews}
          passwordEmail={hasPassword ? (user.email ?? null) : null}
        />
      </MainContainer>
    </>
  );
}
