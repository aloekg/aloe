import { CheckCircle2 } from "lucide-react";
import { MainContainer, MobileHeader, Title } from "@/components";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Для юридических лиц",
  description:
    "Работа с юридическими лицами: счета на оплату, электронные счета-фактуры, снабжение офисов и организаций. Aloe.kg, Бишкек.",
  path: "/legal-entities",
});

const conditions = [
  "Выставляем счета на оплату.",
  "Выписываем электронные счета-фактуры (ЭСФ).",
  "Работаем по безналичному расчету.",
  "Заключаем договоры на поставку товаров.",
];

export default function LegalEntitiesPage() {
  return (
    <>
      <MobileHeader title="Для юридических лиц" withBackButton />
      <MainContainer className="max-w-2xl">
        <Title className="hidden md:block mb-4">Для юридических лиц</Title>

        <div className="divide-y divide-gray-100">
          <section className="py-5">
            <h2 className="text-base font-bold text-gray-900 mb-3">Работаем с организациями и юридическими лицами</h2>
            <p className="text-sm text-gray-700">
              Мы сотрудничаем с офисами, банями, школами, детскими садами, государственными учреждениями, компаниями и
              другими организациями.
            </p>
          </section>

          <section className="py-5">
            <h2 className="text-base font-bold text-gray-900 mb-4">Для вашего удобства</h2>
            <div className="space-y-3">
              {conditions.map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                  <span className="text-sm text-gray-700">{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="py-5">
            <p className="text-sm text-gray-600">
              Если нужного вам товара нет на сайте, по предварительной договоренности мы можем заказать его специально
              для вас.
            </p>
          </section>
        </div>
      </MainContainer>
    </>
  );
}
