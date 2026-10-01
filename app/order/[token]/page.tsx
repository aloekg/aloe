import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MainContainer, MobileHeader, Title } from "@/components";
import { ORDER_STATUS } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { getOrderByReviewToken } from "@/services/review.service";
import ClaimOrderButton from "./ClaimOrderButton";

export const metadata: Metadata = {
  title: "Ваш заказ",
  // Per-order URL carrying a secret.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// The claim happens on a button (./actions.ts), never on this GET: a link must not act by itself.
export default async function ClaimOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const admin = createAdminClient();
  const order = await getOrderByReviewToken(admin, token);
  if (!order) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && order.user_id === user.id) redirect("/profile");

  const status = ORDER_STATUS[order.status ?? "new"] ?? ORDER_STATUS.new;
  const claimable = !order.user_id;

  return (
    <>
      <MobileHeader title={`Заказ №${order.id}`} withBackButton />
      <MainContainer className="max-w-md">
        <Title className="hidden md:block mb-2">Заказ №{order.id}</Title>
        <p className="mb-6">
          <span className={`text-sm px-2 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
        </p>

        {!claimable ? (
          <p className="text-sm text-gray-500">Этот заказ уже привязан к другому аккаунту.</p>
        ) : user ? (
          <div className="border border-gray-300 rounded-xl p-5">
            <p className="font-medium">Сохраните заказ за собой</p>
            <p className="text-sm text-gray-500 mt-1">
              Заказ появится в вашем профиле — вы будете видеть его статус и сможете повторить покупку в одно касание.
            </p>
            <ClaimOrderButton token={token} />
          </div>
        ) : (
          <div className="border border-gray-300 rounded-xl p-5">
            <p className="font-medium">Сохраните заказ за собой</p>
            <p className="text-sm text-gray-500 mt-1">
              Войдите или зарегистрируйтесь — этот заказ привяжется к аккаунту, и вы будете видеть его статус и всю
              историю покупок.
            </p>
            <Link
              href={`/auth?next=${encodeURIComponent(`/order/${token}`)}`}
              className="mt-4 block w-full px-4 py-3 bg-green-700 text-white rounded-lg text-sm font-medium text-center hover:bg-green-800"
            >
              Войти или зарегистрироваться
            </Link>
          </div>
        )}
      </MainContainer>
    </>
  );
}
