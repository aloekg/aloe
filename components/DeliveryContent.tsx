import { RotateCcw, Truck } from "lucide-react";
import { MIN_ORDER_TOTAL, RETURN_WINDOW_DAYS } from "@/lib/constants";

type Props = {
  compact?: boolean;
};

export default function DeliveryContent({ compact = false }: Props) {
  const H = compact ? "h3" : "h2";
  const py = compact ? "py-4" : "py-5";
  const hSize = compact ? "text-sm" : "text-base";

  return (
    <div className={`divide-y divide-gray-100`}>
      <section className={py}>
        <H className={`${hSize} font-bold text-gray-900 mb-4`}>По центру города и микрорайонам г.Бишкек</H>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Truck className="w-5 h-5 text-gray-400 shrink-0" />
            <span className="font-semibold text-gray-900 min-w-35">Доставка 200 сом</span>
            <span className="text-gray-500 text-sm">при заказе от {MIN_ORDER_TOTAL} сом</span>
          </div>
          <div className="flex items-center gap-3">
            <Truck className="w-5 h-5 text-gray-400 shrink-0" />
            <span className="font-semibold text-gray-900 min-w-35">Доставка 0 сом</span>
            <span className="text-gray-500 text-sm">при заказе от 10 000 сом</span>
          </div>
        </div>
      </section>

      <section className={py}>
        <H className={`${hSize} font-bold text-gray-900 mb-4`}>Жил.массивы и отдалённые районы</H>
        <div className="flex items-center gap-3">
          <Truck className="w-5 h-5 text-gray-400 shrink-0" />
          <span className="font-semibold text-gray-900 min-w-35">Доставка 300 сом</span>
          <span className="text-gray-500 text-sm">при заказе от {MIN_ORDER_TOTAL} сом</span>
        </div>
      </section>

      <section className={py}>
        <H className={`${hSize} font-bold text-gray-900 ${compact ? "mb-2" : "mb-4"}`}>Срочная доставка</H>
        <p className="text-sm text-gray-600">Отправляется Яндекс курьером и оплачивается получателем</p>
      </section>

      <section className={py}>
        <H className={`${hSize} font-bold text-gray-900 ${compact ? "mb-2" : "mb-4"}`}>Доставка в регионы</H>
        <p className="text-sm text-gray-600">
          Осуществляется Ылдам Экспресс и рассчитывается по WhatsApp после оформления заказа
        </p>
      </section>

      <section className={py}>
        <H className={`${hSize} font-bold text-gray-900 mb-3`}>Информация о доставке</H>
        <div className="space-y-2 text-sm text-gray-700">
          <p>Принимаем заказы на сайте 24/7</p>
          <p>Обрабатываем заказы с 10:00 до 18:00</p>
          <p>Доставляем по предварительной договорённости с 13:00 до 20:00</p>
          <p>Срочная доставка отправляется с 10:00 до 18:00</p>
          <p>Понедельник — выходной</p>
        </div>
      </section>

      {/* id="returns" is what MERCHANT_RETURN_POLICY.merchantReturnLink points at. The wording is
          the placeholder described on RETURN_WINDOW_DAYS — replace it together with the constant. */}
      <section id="returns" className={py}>
        <H className={`${hSize} font-bold text-gray-900 mb-3`}>Возврат товара</H>
        <div className="space-y-2 text-sm text-gray-700">
          <div className="flex items-center gap-3">
            <RotateCcw className="w-5 h-5 text-gray-400 shrink-0" />
            <span className="font-semibold text-gray-900">{RETURN_WINDOW_DAYS} дней на возврат</span>
          </div>
          <p>
            Товар надлежащего качества можно вернуть в течение {RETURN_WINDOW_DAYS} дней, если он не был в употреблении,
            сохранены его товарный вид, упаковка и потребительские свойства.
          </p>
          <p>Обратная доставка оплачивается покупателем. Деньги возвращаем после получения товара.</p>
          <p>Если товар пришёл повреждённым или не тем — напишите нам в WhatsApp, заменим или вернём деньги.</p>
        </div>
      </section>

      <section className={py}>
        <H className={`${hSize} font-bold text-gray-900 mb-3`}>Способы оплаты</H>
        <div className="space-y-2 text-sm text-gray-700">
          <p>Наличными</p>
          <p>Электронные кошельки (мБанк, Оптима и др.) — после подтверждения заказа через WhatsApp</p>
        </div>
      </section>
    </div>
  );
}
