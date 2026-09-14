import { MainContainer, MobileHeader, Title } from "@/components";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "О нас",
  description:
    "Aloe.kg — семейный магазин бытовой химии и косметики в Бишкеке с опытом более 15 лет. О нас и о том, как мы работаем.",
  path: "/about",
});

const sections = [
  {
    heading: "Мы — семейный магазин с опытом более 15 лет",
    paragraphs: [
      "За Aloe.kg стоит семья. Уже более 15 лет мы занимаемся продажей бытовой химии, а на протяжении 10 лет принимаем заказы через наш сайт и доставляем их вам.",
    ],
  },
  {
    heading: "Для нас важно ваше доверие",
    paragraphs: [
      "Мы дорожим своей репутацией и работаем только с проверенными поставщиками и официальными дистрибьюторами. Поэтому вы можете быть спокойны за качество и оригинальность наших товаров.",
    ],
  },
  {
    heading: "Мы ценим ваше время и помогаем экономить",
    paragraphs: [
      "На сайте Aloe.kg собран весь ассортимент для удобного и быстрого заказа. Вы покупаете напрямую у нас — без лишних посредников и дополнительных наценок.",
      "Вам не нужно тратить время на походы в магазин или долгие онлайн-консультации: вы можете самостоятельно выбрать нужные товары и оформить заказ онлайн.",
    ],
  },
];

export default function AboutPage() {
  return (
    <>
      <MobileHeader title="О нас" withBackButton />
      <MainContainer className="max-w-2xl">
        <Title className="hidden md:block mb-4">О нас</Title>

        <div className="divide-y divide-gray-100">
          {sections.map((section) => (
            <section key={section.heading} className="py-5">
              <h2 className="text-base font-bold text-gray-900 mb-3">{section.heading}</h2>
              <div className="space-y-3">
                {section.paragraphs.map((text) => (
                  <p key={text} className="text-sm text-gray-700">
                    {text}
                  </p>
                ))}
              </div>
            </section>
          ))}

          <section className="py-5 space-y-3">
            <p className="text-sm text-gray-600">
              Aloe.kg — небольшой семейный магазин с большим опытом. Здесь за качеством следит семья, а ваше доверие для
              нас действительно важно.
            </p>
            <p className="text-sm text-gray-600">
              Спасибо, что выбираете нас и позволяете быть частью ваших повседневных покупок. ❤️
            </p>
          </section>
        </div>
      </MainContainer>
    </>
  );
}
