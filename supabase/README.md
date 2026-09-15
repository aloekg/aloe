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
  20260911120600_orders_user_fk_set_null.sql # FK аккаунта у заказа: CASCADE → SET NULL
  20260915090000_storage_buckets.sql        # три публичных бакета — были только в дашборде
sql/
  audit-rls.sql                             # только читающие запросы, не миграция
```

Четыре миграции с префиксом `20260911` были применены к проду вручную через SQL Editor
2026-08-17, до того как схема попала под контроль миграций (baseline снят в 05:33 того же дня,
поэтому он их ещё не содержит — и, например, всё ещё содержит политики заказов, которые
`..._orders_rls_and_grants.sql` удаляет). Все операторы в них идемпотентны
(`if not exists`, `drop policy if exists`, `create or replace`, `revoke`/`grant`), так что
`db push` на прод — no-op, который просто выравнивает историю миграций. `..._not_null_columns.sql` и
`..._products_category_fk_restrict.sql` реально меняли схему, применены 2026-09-11, типы после них
перегенерированы. `..._orders_user_fk_set_null.sql` применена позже, к 2026-09-15 она на проде уже есть
(сверено через `npx supabase migration list`) — пометка «не применено» в этом файле какое-то время
держалась по инерции.

Единственное, что не проверяется из репозитория — применён ли на проде
`..._indexes.sql`: индексы не видны через PostgREST. Миграция идемпотентна, так что push
создаст отсутствующие и не тронет существующие.

**Baseline подправлен руками.** Дословный `db pull` не поднимался на пустом проекте: `DROP EXTENSION
pg_net` падает там, где расширения никогда не было, а `rls_auto_enable()` и событийный триггер
`ensure_rls` Supabase создаёт на новых проектах сам — дамп ловил их как наши и спотыкался о
«already exists». Четыре оператора получили `IF EXISTS` / `IF NOT EXISTS` / `OR REPLACE` и помечены
`-- idempotent:`. Проду это ничего не стоит: версия уже записана в
`supabase_migrations.schema_migrations`, а CLI применённые миграции не перезапускает и не
хеширует. Следующий `db pull` guard'ы снесёт — вернуть.

## Два проекта

| окружение  | project ref            | env-файл     |
| ---------- | ---------------------- | ------------ |
| production | `dnlburbuchxzxdmhuczu` | `.env.prod`  |
| staging    | `puqmkruyhjfvhyjfriig` | `.env.local` |

CLI умеет держать связь ровно с одним проектом, и хранит её в **неотслеживаемом**
`supabase/.temp/project-ref` — то есть на разных машинах она молча разная. Отсюда два правила:

- **`npm run db:types` генерирует из того, что сейчас слинковано.** `types/database.ts` коммитится и
  должен описывать схему **прода**, поэтому перегенерировать только через `npm run db:types:prod`.
  Обычный `db:types` печатает в stderr, из какого проекта он читает — смотрите на эту строку.
- **Заканчивайте сессию со стейджем командой `npm run db:link:prod`.** `migration list`, `db diff` и
  голый `db:types` по умолчанию идут туда, куда указывает ссылка.

## Применить

```bash
npx supabase login
npm run db:push:stage            # сначала стейдж: репетиция на живой схеме
npm run db:push:prod             # затем прод
npm run db:types:prod && npm run typecheck
```

Обе команды сами перелинковывают CLI на нужный проект. Вручную это:

```bash
npx supabase link --project-ref dnlburbuchxzxdmhuczu
npx supabase migration list      # сравнить локальную историю с проддом
npx supabase db push
```

Если `migration list` покажет расхождение из-за ручных применений — не переписывайте файлы, а
выравнивайте историю: `npx supabase migration repair --status applied <version>`.

## Поднять окружение с нуля

Миграции дают схему, RLS, функции и бакеты. Всё остальное живёт только в дашборде, и `config.toml`
это **не** воспроизводит — `supabase config diff` показывает 19 расхождений, а Google-клиент и
отправитель писем в файле вообще не объявлены, так что `config push` их выключит. Не запускайте его.

Руками, в этом порядке:

1. Создать проект в том же регионе, что и прод. Записать ref и ключи.
2. `npm run db:push:stage` (или `link` + `db push` вручную для другого окружения).
3. Проверить бакеты: `select id, public, file_size_limit, allowed_mime_types from storage.buckets;`
   — три строки.
4. **Auth → URL Configuration:** Site URL = адрес окружения; в Redirect URLs добавить
   `https://<хост>/**`, `http://localhost:3000/**`, `http://127.0.0.1:3000/**`. Суффикс `/**`
   обязателен — точная запись не матчит `/auth/confirm?next=/`.
5. **Auth → Email:** подтверждение включено, минимум 8 символов, `lower_upper_letters_digits` —
   зеркалить `config.toml`. `app/auth/validation.ts` дублирует эти правила на клиенте, и при
   расхождении форма примет пароль, который GoTrue отвергнет.
6. **Auth → Email Templates:** скопировать с прода дословно. Прод шлёт `{{ .TokenHash }}` на
   `/auth/confirm`; дефолтный шаблон этого не делает, и `app/auth/confirm/route.ts` уйдёт в
   PKCE-ветку вместо OTP — то есть вы будете проверять путь, которого на проде нет.
7. **Auth → SMTP:** тот же ящик hoster.kg. Без него встроенный отправитель шлёт только членам
   организации Supabase и с лимитом ~2 письма в час.
8. **Google OAuth:** в существующий клиент Google Cloud добавить redirect URI
   `https://<ref>.supabase.co/auth/v1/callback`, затем включить провайдера с тем же Client ID и
   Secret. Отдельный клиент не нужен — у одного может быть несколько URI.
9. **Суперадмин.** Не через форму регистрации (она зависит от шага 7): Authentication → Users →
   Add user → **Auto Confirm**, затем SQL Editor:
   ```sql
   update auth.users
      set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"superadmin"}'::jsonb
    where email = 'owner@example.com';
   ```
   Без этого шага в проекте ноль админов и `/admin/users` отдаёт 404 всем.
10. Каталог: `npm run backup:prod`, затем `npm run seed:stage` (dry run) и
    `node scripts/seed-staging.mjs --env=stage --execute`. В конце скрипт напечатает блок `setval` —
    выполнить его в SQL Editor, иначе первая же вставка из админки упадёт на duplicate key.

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

## Заказ не должен умирать вместе с аккаунтом

`orders_user_id_fkey` был `ON DELETE CASCADE`: удаление аккаунта стирало все его заказы — молча, и
из дашборда (Authentication → Users) так же, как из кода. `..._orders_user_fk_set_null.sql`
переводит его на `SET NULL`. Заказ ничего не берёт из аккаунта для отображения — `customer_name`,
`customer_phone`, `customer_address` и `items` заморожены в строке при оформлении (на этом же
держится гостевой чекаут, `user_id` nullable по замыслу), так что заказы удалённого аккаунта просто
становятся гостевыми и остаются в `/admin/orders` и в выручке. Корзина и избранное продолжают
каскадиться — это живое состояние, а не записи.

## Регенерация типов

`types/database.ts` сгенерирован из схемы и коммитится. После любой миграции:

```bash
npm run db:types:prod
npm run typecheck
```

Именно `:prod`: файл описывает схему, по которой собирается прод, а голый `db:types` читает из того
проекта, который сейчас слинкован — после работы со стейджем это будет стейдж.
