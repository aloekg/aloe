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
  // Per-customer URL carrying a secret.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const admin = createAdminClient();
  const order = await getOrderByReviewToken(admin, token);

  // Unknown token and undelivered order both 404 on purpose: do not confirm a token exists.
  if (!order || !orderCanBeReviewed(order.status)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const items = (order.items ?? []) as OrderItem[];
  const reviewed = user
    ? await getReviewedProductIds(
        admin,
        user.id,
        items.map((i) => i.id),
      )
    : [];
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
            <p className="text-sm text-gray-500 mt-1">
              Спасибо! Изменить свои отзывы можно в профиле, во вкладке «Отзывы».
            </p>
            <Link href="/profile" className="text-green-700 text-sm mt-3 inline-block hover:underline">
              Мои отзывы
            </Link>
          </div>
        ) : (
          <ReviewForm token={token} items={pending} />
        )}
      </MainContainer>
    </>
  );
}
