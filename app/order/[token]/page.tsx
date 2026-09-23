import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MainContainer, MobileHeader, Title } from "@/components";
import { ORDER_STATUS } from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { claimOrderForUser, getOrderByReviewToken } from "@/services/review.service";

export const metadata: Metadata = {
  title: "Ваш заказ",
  // A per-order URL carrying a secret. `/order/:path*` also gets no-referrer in next.config.ts.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Attaches a guest order to the account that just signed in, and is the honest half of the promise
 * `/checkout/success` makes to a guest — "с аккаунтом вы увидите статус этого заказа".
 *
 * Without it that promise was false: checkout stores `user_id = null` for a guest, registering
 * afterwards matched nothing, and the customer arrived at an empty profile. Matching on the phone
 * instead would let anyone who knows a number claim someone else's orders and read their address.
 *
 * So the order's token is the proof, exactly as it is for the review link: it is handed to the
 * browser that placed the order and, later, to the customer's own WhatsApp. The claim only ever
 * applies while the order belongs to nobody, so a link shared afterwards changes nothing.
 */
export default async function ClaimOrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const admin = createAdminClient();
  const order = await getOrderByReviewToken(admin, token);
  if (!order) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // Conditional on `user_id is null` inside the query — an order that already belongs to someone
    // never changes hands, however the link travelled afterwards.
    if (!order.user_id) await claimOrderForUser(admin, order.id, user.id);
    redirect("/profile");
  }

  const status = ORDER_STATUS[order.status ?? "new"] ?? ORDER_STATUS.new;

  return (
    <>
      <MobileHeader title={`Заказ №${order.id}`} withBackButton />
      <MainContainer className="max-w-md">
        <Title className="hidden md:block mb-2">Заказ №{order.id}</Title>
        <p className="mb-6">
          <span className={`text-sm px-2 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
        </p>

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
      </MainContainer>
    </>
  );
}
