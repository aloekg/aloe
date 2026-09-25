import type { AnalyticsInsights, NamedStat } from "@/lib/analytics-insights";
import { BarList, Card, EmptyNote, money, percent, ProductTable, SHORT_ZONE } from "./analytics-ui";
import AnalyticsBarChart from "./AnalyticsBarChart";

function NamedBarList({ stats }: { stats: NamedStat[] }) {
  if (stats.length === 0) return <EmptyNote>Продаж нет</EmptyNote>;
  const top = stats[0].revenue;
  return (
    <BarList
      rows={stats.map((stat) => ({
        key: String(stat.id ?? "none"),
        label: stat.name,
        value: `${money(stat.revenue)} с · ${stat.quantity} шт.`,
        share: top ? stat.revenue / top : 0,
      }))}
    />
  );
}

export function CategoriesCard({ insights }: { insights: AnalyticsInsights }) {
  return (
    <Card title="Топ категорий" note="По текущему месту товара в каталоге">
      <NamedBarList stats={insights.categories} />
    </Card>
  );
}

export function BrandsCard({ insights }: { insights: AnalyticsInsights }) {
  return (
    <Card title="Топ брендов">
      <NamedBarList stats={insights.brands} />
    </Card>
  );
}

export function PromoCard({ insights: { promo } }: { insights: AnalyticsInsights }) {
  return (
    <Card
      title="Акции"
      note="Товар считается акционным, если у него сейчас метка «Акция» или старая цена — в заказе это не сохраняется"
    >
      <div className="text-2xl font-semibold text-gray-900 tabular-nums">
        {percent(promo.promoRevenue, promo.goodsRevenue)}
      </div>
      <p className="text-xs text-gray-500">выручки от товаров пришлось на акционные</p>

      <div className="mt-3 flex h-2 gap-[2px] overflow-hidden rounded-full">
        <div
          className="rounded-l-full bg-green-700"
          style={{ width: promo.goodsRevenue ? `${(promo.promoRevenue / promo.goodsRevenue) * 100}%` : 0 }}
        />
        <div className="flex-1 rounded-r-full bg-gray-200" />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-gray-500">Акционные продажи</dt>
          <dd className="font-medium text-gray-900 tabular-nums">
            {money(promo.promoRevenue)} с · {promo.promoQuantity} шт.
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Продавались из акционных</dt>
          <dd className="font-medium text-gray-900 tabular-nums">
            {promo.soldProducts} из {promo.catalogueProducts}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

export function ThresholdCard({ insights: { threshold } }: { insights: AnalyticsInsights }) {
  const points = threshold.bins.map((bin) => {
    const range = bin.to == null ? `от ${money(bin.from)}` : `${money(bin.from)}–${money(bin.to - 1)}`;
    return {
      key: String(bin.from),
      label: bin.to == null ? `${bin.from / 1000}+` : String(bin.from / 1000),
      value: bin.orders,
      detail: `${range} с · ${bin.orders} зак.`,
      muted: bin.from < threshold.threshold,
    };
  });

  return (
    <Card
      title={`Порог бесплатной доставки — ${money(threshold.threshold)} с`}
      note="Сумма товаров в заказах с доставкой по центру — только там порог отменяет плату"
    >
      {threshold.orders === 0 ? (
        <EmptyNote>Заказов с доставкой по центру нет</EmptyNote>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-gray-500">Не дотянули</div>
              <div className="font-medium text-gray-900 tabular-nums">
                {threshold.nearMiss} зак.{" "}
                <span className="font-normal text-gray-500">
                  {money(threshold.threshold - threshold.near)}–{money(threshold.threshold - 1)} с
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Чуть выше порога</div>
              <div className="font-medium text-gray-900 tabular-nums">
                {threshold.justOver} зак.{" "}
                <span className="font-normal text-gray-500">
                  {money(threshold.threshold)}–{money(threshold.threshold + threshold.near - 1)} с
                </span>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500">Бесплатно доставлено</div>
              <div className="font-medium text-gray-900 tabular-nums">
                {percent(
                  threshold.bins.filter((b) => b.from >= threshold.threshold).reduce((sum, b) => sum + b.orders, 0),
                  threshold.orders,
                )}
              </div>
            </div>
          </div>

          <AnalyticsBarChart points={points} tickEvery={1} />

          <div className="mt-2 flex items-center gap-4 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-gray-300" /> платная доставка
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-green-700/80" /> бесплатная
            </span>
            <span className="ml-auto">тыс. сом</span>
          </div>
        </>
      )}
    </Card>
  );
}

export function CancellationsCard({ insights: { cancellations } }: { insights: AnalyticsInsights }) {
  const worstZoneRate = Math.max(...cancellations.byZone.map((z) => (z.orders ? z.cancelled / z.orders : 0)), 0);

  return (
    <Card title="Отмены" note="По всем заказам периода, независимо от «Считать отменённые»">
      <div className="text-2xl font-semibold text-gray-900 tabular-nums">
        {percent(cancellations.cancelled, cancellations.total)}
      </div>
      <p className="text-xs text-gray-500">
        {cancellations.cancelled} из {cancellations.total} заказов отменены
      </p>

      <h3 className="mt-4 mb-1.5 text-xs font-medium text-gray-500">По зонам доставки</h3>
      <BarList
        rows={cancellations.byZone.map((zone) => ({
          key: zone.id,
          label: SHORT_ZONE[zone.id] ?? zone.id,
          value: `${percent(zone.cancelled, zone.orders)} · ${zone.cancelled} из ${zone.orders}`,
          share: worstZoneRate && zone.orders ? zone.cancelled / zone.orders / worstZoneRate : 0,
        }))}
      />

      <h3 className="mt-4 mb-1.5 text-xs font-medium text-gray-500">Чаще всего в отменённых</h3>
      {cancellations.byProduct.length === 0 ? (
        <EmptyNote>Нет товаров, отменённых больше одного раза</EmptyNote>
      ) : (
        <ProductTable
          columns={["Отменено", "Доля"]}
          rows={cancellations.byProduct.map((product) => ({
            key: product.id,
            name: product.name,
            cells: [`${product.cancelled} из ${product.orders}`, percent(product.cancelled, product.orders)],
          }))}
        />
      )}
    </Card>
  );
}

export function RepeatCard({ insights: { repeat } }: { insights: AnalyticsInsights }) {
  const activeCustomers = repeat.lifetime.reduce((sum, b) => sum + b.customers, 0);
  const topBucket = Math.max(...repeat.lifetime.map((b) => b.customers), 0);

  return (
    <Card title="Повторные покупки">
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-gray-500">Вернулись за вторым заказом</dt>
          <dd className="text-2xl font-semibold text-gray-900 tabular-nums">
            {percent(repeat.returned, repeat.cohort)}
          </dd>
          <dd className="text-xs text-gray-500">
            {repeat.returned} из {repeat.cohort} новых в этом периоде
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">До второго заказа</dt>
          <dd className="text-2xl font-semibold text-gray-900 tabular-nums">
            {repeat.medianDaysToSecond == null ? "—" : `${repeat.medianDaysToSecond} дн.`}
          </dd>
          <dd className="text-xs text-gray-500">медиана</dd>
        </div>
      </dl>
      {repeat.cohort > 0 && repeat.returned === 0 && (
        <p className="mt-2 text-xs text-gray-500">
          На коротком периоде новые покупатели ещё не успели вернуться — точнее видно на 90 днях или за всё время.
        </p>
      )}

      <h3 className="mt-4 mb-1.5 text-xs font-medium text-gray-500">
        Покупатели периода — сколько всего заказов у них в истории
      </h3>
      {activeCustomers === 0 ? (
        <EmptyNote>Покупателей нет</EmptyNote>
      ) : (
        <BarList
          rows={repeat.lifetime.map((bucket) => ({
            key: bucket.label,
            label: bucket.label,
            value: `${bucket.customers} · ${percent(bucket.customers, activeCustomers)}`,
            share: topBucket ? bucket.customers / topBucket : 0,
          }))}
        />
      )}
    </Card>
  );
}

export function FavoritesCard({ insights: { favorites } }: { insights: AnalyticsInsights }) {
  return (
    <Card
      title="Избранное и продажи"
      note="Сколько аккаунтов держат товар в избранном сейчас и сколько штук продано за период. Гостей тут нет — избранное только у вошедших."
    >
      {favorites.length === 0 ? (
        <EmptyNote>В избранном пока ничего нет</EmptyNote>
      ) : (
        <ProductTable
          columns={["В избранном", "Продано"]}
          rows={favorites.map((product) => ({
            key: product.id,
            name: product.name,
            cells: [
              product.favorites,
              <span key="sold" className={product.sold === 0 ? "text-red-700" : undefined}>
                {product.sold === 0 ? "0 — не покупали" : product.sold}
              </span>,
            ],
          }))}
        />
      )}
    </Card>
  );
}

export function UnsoldCard({ insights: { unsold } }: { insights: AnalyticsInsights }) {
  return (
    <Card title="Без продаж за период" note="Опубликованные товары; добавленные в течение периода не учитываются">
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-gray-500">Не продавались</dt>
          <dd className="text-2xl font-semibold text-gray-900 tabular-nums">{unsold.total}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Из них ни разу за всё время</dt>
          <dd className="text-2xl font-semibold text-gray-900 tabular-nums">{unsold.neverSold}</dd>
        </div>
      </dl>

      <h3 className="mt-4 mb-1.5 text-xs font-medium text-gray-500">Продавались раньше, а сейчас нет</h3>
      {unsold.stalled.length === 0 ? (
        <EmptyNote>Таких нет</EmptyNote>
      ) : (
        <ProductTable
          columns={["Продано всего"]}
          rows={unsold.stalled.map((product) => ({
            key: product.id,
            name: product.name,
            cells: [product.purchaseCount],
          }))}
        />
      )}
    </Card>
  );
}
