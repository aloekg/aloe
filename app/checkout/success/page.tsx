import { Check, MessageCircle, Package, Phone } from "lucide-react";
import Link from "next/link";
import { InstallAppIos, MainContainer } from "@/components";
import { WHATSAPP_LINK } from "@/lib/constants";
import { createClient } from "@/lib/supabase-server";

export const metadata = {
  title: "Заказ оформлен",
  robots: { index: false, follow: false },
};

/** What happens next, in the order it happens. Written from how this shop actually works. */
const STEPS = [
  { icon: Phone, title: "Позвоним и подтвердим", text: "Уточним состав заказа, адрес и время доставки." },
  { icon: Package, title: "Привезём", text: "В день заказа, если вы оформили его до 15:00." },
  { icon: Check, title: "Оплатите при получении", text: "Наличными курьеру или переводом на кошелёк." },
];

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;

  // Decides which call to action this page leads with. A guest has nothing behind "Мои заказы" —
  // /profile bounces them to /auth — and 24 of 25 orders here are placed by one, so leading with
  // that button sent the majority of customers into a redirect.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <MainContainer className="max-w-lg">
      <div className="flex flex-col items-center text-center pt-8 pb-2">
        {/* A real icon, not ✅: an emoji renders as a different picture on every platform and at a
            size the layout does not control. */}
        <span className="flex items-center justify-center size-16 rounded-full bg-green-100 mb-4" aria-hidden>
          <Check className="size-9 text-green-700" strokeWidth={2.5} />
        </span>
        <h1 className="text-2xl font-bold">Заказ оформлен</h1>
        {id && (
          <p className="mt-3 text-sm text-gray-500">
            Номер заказа
            {/* Big and selectable: this is the one thing a customer may need to quote back over
                WhatsApp, and on a phone that means copying it or screenshotting it. */}
            <span className="block mt-0.5 text-3xl font-bold tracking-tight text-gray-900 select-all">#{id}</span>
          </p>
        )}
      </div>

      <ol className="mt-8 flex flex-col gap-4">
        {STEPS.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className="flex gap-3">
            <span className="relative flex flex-col items-center shrink-0">
              <span className="flex items-center justify-center size-9 rounded-full bg-gray-100 text-gray-500">
                <Icon className="size-4.5" aria-hidden />
              </span>
              {/* Connects the steps into one line so they read as a sequence, not three cards. */}
              {i < STEPS.length - 1 && <span className="flex-1 w-px bg-gray-200 mt-1" aria-hidden />}
            </span>
            <span className="pb-1">
              <span className="block text-sm font-medium">{title}</span>
              <span className="block text-sm text-gray-500">{text}</span>
            </span>
          </li>
        ))}
      </ol>

      {/* The primary action, and it differs by who is reading. For a guest the account is the useful
          next step — it is the only way they will ever see this order again. */}
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
            href={`/auth?next=${encodeURIComponent(id ? `/profile?order=${id}` : "/profile")}`}
            className="mt-3 block w-full px-4 py-3 bg-green-700 text-white rounded-lg text-sm font-medium text-center hover:bg-green-800"
          >
            Создать аккаунт
          </Link>
          <Link href="/" className="mt-2 block text-center text-sm text-gray-500 hover:text-gray-700">
            Продолжить покупки
          </Link>
        </div>
      )}

      {/* WhatsApp is how this shop talks to customers — consultations, payment confirmations and the
          regions delivery quote all go through it. Anyone who spots a mistake in the order they just
          placed needs it right here, not three pages away in /contacts. */}
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
