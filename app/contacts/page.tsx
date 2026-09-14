import { FaWhatsapp } from "react-icons/fa";
import { MainContainer, MobileHeader, Title } from "@/components";

export const metadata = {
  title: "Контакты",
};

const WHATSAPP_NUMBER = "+996 556 400 656";
// wa.me wants the number without spaces or a leading plus.
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER.replace(/\D/g, "")}`;

const topics = [
  "способах оплаты;",
  "предоставлении необходимых документов;",
  "оптовых и специальных заказах;",
  "наличии и поиске нужного вам товара.",
];

export default function ContactsPage() {
  return (
    <>
      <MobileHeader title="Контакты" withBackButton />
      <MainContainer className="max-w-2xl">
        <Title className="hidden md:block mb-4">Контакты</Title>

        <a
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl bg-green-50 px-4 py-4 transition-colors hover:bg-green-100"
        >
          <FaWhatsapp className="w-8 h-8 text-green-600 shrink-0" />
          <span>
            <span className="block text-xs text-gray-500">WhatsApp</span>
            <span className="block text-base font-bold text-gray-900">{WHATSAPP_NUMBER}</span>
          </span>
        </a>

        <div className="divide-y divide-gray-100">
          <section className="py-5 space-y-3">
            <p className="text-sm text-gray-700">
              Если вам нужна помощь с заказом, консультация или вы не нашли нужный товар на сайте — напишите нам в
              WhatsApp. Мы постараемся найти и предложить подходящий вариант.
            </p>
            <p className="text-sm text-gray-700">
              Также принимаем оптовые заказы для офисов, школ, бань, организаций и т. д.
            </p>
          </section>

          <section className="py-5">
            <h2 className="text-base font-bold text-gray-900 mb-3">
              В WhatsApp вы можете получить подробную информацию о:
            </h2>
            <ul className="space-y-2">
              {topics.map((topic) => (
                <li key={topic} className="flex gap-2 text-sm text-gray-700">
                  <span className="text-green-600" aria-hidden>
                    •
                  </span>
                  <span>{topic}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="py-5">
            <p className="text-sm text-gray-600">Будем рады помочь вам! ❤️</p>
          </section>
        </div>
      </MainContainer>
    </>
  );
}
