import { DeliveryContent, MainContainer, MobileHeader, Title } from "@/components";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Доставка и оплата",
  description:
    "Доставка по Бишкеку в день заказа, бесплатно от 10 000 сом. Условия доставки и способы оплаты в интернет-магазине Aloe.kg.",
  path: "/delivery",
});

export default function DeliveryPage() {
  return (
    <>
      <MobileHeader title="Доставка и оплата" withBackButton />
      <MainContainer className="max-w-2xl">
        <Title className="hidden md:block mb-4">Доставка и оплата</Title>
        <DeliveryContent />
      </MainContainer>
    </>
  );
}
