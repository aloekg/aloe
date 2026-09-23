import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MainContainer, MobileHeader, Title } from "@/components";
import { orderCanBeReviewed, reviewableItems } from "@/lib/reviews";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { getOrderByReviewToken, getReviewedProductIds } from "@/services/review.service";
import type { OrderItem } from "@/types";
import ReviewForm from "./ReviewForm";

export const metadata: Metadata = {
  title: "Оставить отзыв",
  // A per-customer URL carrying a secret: it must never be indexed, and must not leak through a
  // referrer either. The `/review/:path*` no-referrer rule in next.config.ts covers the second.
  robots: { index: false, follow: false },
};

/** Never cached: the form depends on the session and on what has already been reviewed. */
export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const admin = createAdminClient();
  const order = await getOrderByReviewToken(admin, token);

  // A bad token and an undelivered order both 404: confirming that a token exists is already more
  // than someone holding a guessed link should learn.
  if (!order || !orderCanBeReviewed(order.status)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const items = (order.items ?? []) as OrderItem[];
  const reviewed = await getReviewedProductIds(admin, order.id);
  const pending = reviewableItems(items, reviewed);

  return (
    <>
      <MobileHeader title="Отзыв о заказе" withBackButton />
      <MainContainer className="max-w-xl">
        <Title className="hidden md:block mb-2">Как вам заказ №{order.id}?</Title>
        <p className="text-sm text-gray-500 mb-6">
          Оценка появится на странице товара после проверки. Она помогает другим покупателям — и нам.
        </p>

        {!user ? (
          <div className="border border-gray-300 rounded-xl p-5 text-center">
            <p className="font-medium mb-1">Войдите, чтобы оставить отзыв</p>
            <p className="text-sm text-gray-500 mb-4">
              Заодно заказ привяжется к вашему аккаунту — и вся история покупок будет под рукой.
            </p>
            {/* `next` brings them back to this exact token, so the link survives the round trip. */}
            <Link
              href={`/auth?next=${encodeURIComponent(`/review/${token}`)}`}
              className="inline-block px-4 py-2.5 bg-green-700 text-white rounded-lg text-sm hover:bg-green-800"
            >
              Войти или зарегистрироваться
            </Link>
          </div>
        ) : pending.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-lg font-medium">Вы уже оценили всё из этого заказа</p>
            <p className="text-sm text-gray-500 mt-1">Спасибо! Отзывы появятся после проверки.</p>
            <Link href="/profile" className="text-green-700 text-sm mt-3 inline-block hover:underline">
              Мои заказы
            </Link>
          </div>
        ) : (
          <ReviewForm token={token} items={pending} />
        )}
      </MainContainer>
    </>
  );
}
