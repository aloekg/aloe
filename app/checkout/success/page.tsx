import Link from "next/link";
import { InstallAppIos, MainContainer, Title } from "@/components";

export const metadata = {
  title: "Заказ оформлен",
  robots: { index: false, follow: false },
};

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const shortId = id ?? "—";

  return (
    <>
      <MainContainer className="max-w-lg text-center pt-20">
        <div className="text-6xl mb-4">✅</div>
        <Title className="mb-2">Заказ оформлен!</Title>
        <p className="text-gray-500 mb-1">
          Номер заказа: <span className="font-mono font-bold text-gray-700">#{shortId}</span>
        </p>
        <p className="text-gray-500 text-sm mb-8">
          Мы свяжемся с вами по телефону для подтверждения. Доставка производится в день заказа (при заявке до 15:00).
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/" className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
            На главную
          </Link>
          <Link href="/profile" className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            Мои заказы
          </Link>
        </div>

        <InstallAppIos className="mt-10 text-left" />
      </MainContainer>
    </>
  );
}
