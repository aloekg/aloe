# Supabase — схема и миграции

Схема, RLS-политики и функции лежат в `supabase/migrations/` и применяются через CLI. Раньше они
жили только в дашборде; теперь окружение воспроизводится из репозитория.

```
migrations/
  20260817053308_remote_schema.sql          # baseline: db pull с прода 2026-08-17
  20260818040731_products_thumbnail_url.sql # products.thumbnail_url
  20260911120000_orders_rls_and_grants.sql  # сужение прав anon/authenticated (был 002)
  20260911120100_indexes.sql                # индексы под реальные запросы (был 003)
  20260911120200_order_notification_tracking.sql  # orders.notified_at (был 004)
  20260911120300_rate_limits.sql            # таблица + rate_limit_hit() (был 005)
  20260911120400_not_null_columns.sql       # NOT NULL + CHECK «опубликованный товар категоризован»
  20260911120500_products_category_fk_restrict.sql # FK категории: SET NULL → RESTRICT
sql/
  audit-rls.sql                             # только читающие запросы, не миграция
```

Четыре миграции с префиксом `20260911` были применены к проду вручную через SQL Editor
2026-08-17, до того как схема попала под контроль миграций (baseline снят в 05:33 того же дня,
поэтому он их ещё не содержит — и, например, всё ещё содержит политики заказов, которые
`..._orders_rls_and_grants.sql` удаляет). Все операторы в них идемпотентны
(`if not exists`, `drop policy if exists`, `create or replace`, `revoke`/`grant`), так что
`db push` на прод — no-op, который просто выравнивает историю миграций. Две последние
(`..._not_null_columns.sql`, `..._products_category_fk_restrict.sql`) реально меняли схему и
применены 2026-09-11; типы после них перегенерированы.

Единственное, что не проверяется из репозитория — применён ли на проде
`..._indexes.sql`: индексы не видны через PostgREST. Миграция идемпотентна, так что push
создаст отсутствующие и не тронет существующие.

## Применить

```bash
npx supabase login
npx supabase link --project-ref dnlburbuchxzxdmhuczu
npx supabase migration list      # сравнить локальную историю с проддом
npx supabase db push
npm run db:types && npm run typecheck
```

Если `migration list` покажет расхождение из-за ручных применений — не переписывайте файлы, а
выравнивайте историю: `npx supabase migration repair --status applied <version>`.

## Nullable-колонки: что закрыто, а что нет

`products.price/image_url/published`, `banners.active/sort_order`, `orders.status/created_at`
nullable в базе, хотя приложение считает их обязательными — из-за этого в
`services/product.service.ts` (строки 25, 135, 167) и `services/favorites.service.ts` (39) стоят
касты `as unknown as ProductListRow[]`: сгенерированный тип говорит `price: number | null`, а
`Product` — `price: number`. `..._not_null_columns.sql` это закрывает, с самопроверкой: колонки с
осмысленным дефолтом бэкфиллятся, а `price`/`image_url` придумать нельзя, поэтому при NULL-ах
миграция падает с их количеством, а не ставит цену 0.

**`products.category_id`/`category` остались nullable — сознательно.** Первый прогон миграции
упёрся ровно в них, и данные оказались правы: 91 товар с NULL `category_id` (текстовая метка старой
категории сохранилась, цена и фото на месте, все не опубликованы). Их осиротил сам FK —
`fk_products_category_id` был `ON DELETE SET NULL`, то есть удаление занятой категории вычищало
`category_id` у её товаров, и они выпадали из всех каталожных запросов, оставаясь опубликованными,
доступными поиску и в sitemap (см. комментарий в `deleteCategory`, app/admin/actions.ts). Значит
«категории пока нет» — реально существующее состояние черновика, и NOT NULL просто заблокировал бы
миграцию навсегда.

Вместо NOT NULL — инвариант, на который storefront действительно опирается:

```sql
check (not published or (category_id is not null and category is not null))
```

Черновик без категории легален, но опубликовать его в таком виде нельзя. Плюс
`..._products_category_fk_restrict.sql` переводит FK на `ON DELETE RESTRICT`, чтобы база больше не
осиротила товары молча (в админке проверка перед удалением уже есть — это страховка уровня схемы).

Сделано: миграции применены, типы перегенерированы, касты в сервисах сузились с
`as unknown as ProductListRow[]` до одинарного `as ProductListRow[]`. Полностью убрать их не
получается — без каста остаётся ровно одно несоответствие, `category_id: number | null` против
`number`, и это инвариант из CHECK, которого генератор типов не видит. Что именно утверждает каст,
написано над `ProductListRow` в `types/index.ts`.

Осталось руками: раздать категории тем 91 товарам. Они группируются по сохранённой метке —
это и есть подсказка для массового редактирования в админке:

```sql
select category as old_label, count(*), min(id), max(id)
from public.products
where category_id is null
group by category
order by count(*) desc;
```

## Аудит RLS — результаты (2026-09-11)

Проверено эмпирически: публичным anon-ключом по PostgREST, неизменяющими запросами (DELETE/PATCH с
фильтром `id=eq.-1`, RPC с пустым массивом). `sql/audit-rls.sql` остаётся для проверки политик
изнутри SQL Editor.

| проба (anon)                                             | результат                 |
| -------------------------------------------------------- | ------------------------- |
| `select` orders / profiles / cart_items / favorites      | `[]` — RLS режет          |
| `select` products                                        | отдаёт только `published` |
| `select` rate_limits                                     | 42501 permission denied   |
| `delete` / `patch` products, categories, banners, brands | 42501 permission denied   |
| `patch` / `delete` orders                                | 42501 permission denied   |
| `rpc increment_product_purchase_counts`                  | 42501 permission denied   |
| `rpc rate_limit_hit`                                     | 42501 permission denied   |

То есть `..._orders_rls_and_grants.sql` и `..._rate_limits.sql` на проде действительно применены:
права на запись у anon отозваны, RPC закрыты, `rate_limits` недоступна. Роль `authenticated`
отдельным токеном не проверялась, но `revoke ... from anon, authenticated` — один оператор: раз
anon права потерял, потерял и authenticated.

Отдельно про заказы: гостевой чекаут пишет service-role ключом, то есть RLS на `orders` со стороны
приложения не участвует вообще, а `orders.user_id` допускает NULL (гостевые заказы). Политики
чтения сформулированы как `user_id = auth.uid()`, что на NULL-строке даёт NULL, а не false — для
`SELECT` это безопасно (строка просто не видна), но ломается при небрежной формулировке через `OR`.
Писать в `orders` anon/authenticated больше не могут в принципе — грант отозван, так что RLS там
уже не последняя линия защиты.

## Регенерация типов

`types/database.ts` сгенерирован из схемы и коммитится. После любой миграции:

```bash
npm run db:types
npm run typecheck
```
