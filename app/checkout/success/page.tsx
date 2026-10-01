import { Check, MessageCircle, Package, Phone, Wallet } from "lucide-react";
import Link from "next/link";
import { InstallAppIos, MainContainer } from "@/components";
import { WHATSAPP_LINK } from "@/lib/constants";
import { createClient } from "@/lib/supabase-server";

export const metadata = {
  title: "Заказ оформлен",
  robots: { index: false, follow: false },
};

const STEPS = [
  { icon: Phone, title: "Позвоним и подтвердим", text: "Уточним состав заказа, адрес и время доставки." },
  { icon: Package, title: "Привезём", text: "В день заказа, если вы оформили его до 15:00." },
  { icon: Wallet, title: "Оплатите при получении", text: "Наличными курьеру или переводом на кошелёк." },
];

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; t?: string }>;
}) {
  const { id, t: token } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <MainContainer className="max-w-lg">
      <div className="flex flex-col items-center text-center pt-8 pb-2">
        <span className="flex items-center justify-center size-16 rounded-full bg-green-100 mb-4" aria-hidden>
          <Check className="size-9 text-green-700" strokeWidth={2.5} />
        </span>
        <h1 className="text-2xl font-bold">Заказ оформлен</h1>
        {id && (
          <p className="mt-3 text-sm text-gray-500">
            Номер заказа
            <span className="block mt-0.5 text-3xl font-bold tracking-tight text-gray-900 select-all">#{id}</span>
          </p>
        )}
      </div>

      <ol className="mt-8 flex flex-col gap-5">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="flex items-start gap-3">
            <span className="relative shrink-0">
              <span className="flex items-center justify-center size-10 rounded-full bg-gray-100 text-gray-500">
                <Icon className="size-5" aria-hidden />
              </span>
              <span
                aria-hidden
                className="absolute -top-1 -left-1 flex items-center justify-center size-5 rounded-full bg-green-700 text-white text-[11px] font-bold"
              >
                {i + 1}
              </span>
            </span>
            <span className="pt-0.5">
              <span className="block text-sm font-medium">{title}</span>
              <span className="block text-sm text-gray-500 mt-0.5">{text}</span>
            </span>
          </li>
        ))}
      </ol>

      {user ? (
        <div className="mt-8 flex flex-col gap-2">
          <Link
            href="/profile"
            className="w-full px-4 py-3 bg-green-700 text-white rounded-lg text-sm font-medium text-center hover:bg-green-800"
          >
            Мои заказы
          </Link>
          <Link
            href="/"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm text-center hover:bg-gray-50"
          >
            Продолжить покупки
          </Link>
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-gray-300 p-4">
          <p className="text-sm font-medium">Сохраните заказ за собой</p>
          <p className="text-sm text-gray-500 mt-1">
            С аккаунтом вы увидите статус этого заказа и всю историю покупок — и сможете повторить их в одно касание.
          </p>
          <Link
            // Through /order/<token>: that is what attaches a guest order to the new account.
            href={`/auth?next=${encodeURIComponent(token ? `/order/${token}` : "/profile")}`}
            className="mt-3 block w-full px-4 py-3 bg-green-700 text-white rounded-lg text-sm font-medium text-center hover:bg-green-800"
          >
            Создать аккаунт
          </Link>
          <Link href="/" className="mt-2 block text-center text-sm text-gray-500 hover:text-gray-700">
            Продолжить покупки
          </Link>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-gray-500">
        Что-то не так с заказом?{" "}
        <a
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-green-700 hover:underline"
        >
          <MessageCircle className="size-4" aria-hidden />
          Напишите нам
        </a>
      </p>

      <InstallAppIos className="mt-10 text-left" />
    </MainContainer>
  );
}
