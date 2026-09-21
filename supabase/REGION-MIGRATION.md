# Переезд прод-проекта Supabase: Мумбай → Франкфурт

Порядок действий для переноса production-проекта в новый регион. Состояние на 21 сентября 2026:
подготовлено, **не выполнено**.

|        | старый                     | новый                    |
| ------ | -------------------------- | ------------------------ |
| ref    | `dnlburbuchxzxdmhuczu`     | `<NEW_REF>`              |
| регион | ap-south-1 (Мумбай)        | eu-central-1 (Франкфурт) |
| роль   | production до переключения | production после         |

Объём: 3164 товара, 160 категорий, 193 бренда, 34 заказа, 5 профилей — БД крошечная, дамп и restore
занимают минуты. Долгий шаг один: **6957 объектов / 244 MB в Storage**, и он делается заранее, до
окна.

## Что переезжает, а что нет

Переезжает дампом: все таблицы `public`, схема `auth` целиком (**пароли пользователей сохраняются**),
роли, гранты, RLS-политики, функции (`rate_limit_hit`, `increment_product_purchase_counts`),
последовательности, история миграций.

Переезжает отдельным скриптом: файлы Storage и настройки бакетов.

**Не переезжает — заводится руками в дашборде нового проекта:** провайдер Google OAuth, Site URL и
список redirect-ов, SMTP-отправитель и шаблоны писем Auth, настройки подтверждения email, лимиты
Auth. `supabase/config.toml` тут не помощник: дашборд — источник истины, и файл от него давно
разошёлся (см. шапку самого config.toml).

**Меняется безвозвратно:** JWT-секрет, а значит **все залогиненные пользователи разлогинятся** —
и покупатели, и админ. Корзины и избранное от этого не страдают: `cart_items`/`favorites` переезжают
в БД, а гостевые лежат в localStorage браузера.

Vault, column encryption, pg_cron и Database Webhooks не используются, поэтому оговорка гайда про
копирование encryption root key к нам не относится. Единственное неродное расширение — `pg_trgm`
в схеме `public` (под поиск), его надо проверить после restore.

## 1. Подготовка (заранее, без окна)

1. **Бэкап старого проекта двумя способами.** `npm run backup:prod` (таблицы в JSON) плюс дампы из
   шага 2 — они же и бэкап. Storage бэкапами не покрыт вообще, его копия и есть шаг 4.
2. **`.env.new`** в корне репозитория: `NEXT_PUBLIC_SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY`
   нового проекта. Файл под `.env*` в `.gitignore`. Скрипты миграции читают только его и `.env.prod`,
   обычные скрипты в него не попадают (`resolveTarget` их не пускает).
3. **Пароль БД обоих проектов** — Dashboard → Database → Settings, при необходимости сбросить.
   Строку подключения брать из кнопки **Connect**, вариант **Session pooler** (IPv4): direct-хост
   `db.<ref>.supabase.co` отвечает только по IPv6, и из докера не разрешится.
4. **Формат API-ключей нового проекта.** Проекты, созданные недавно, могут отдавать ключи нового
   формата (`sb_publishable_…` / `sb_secret_…`) вместо legacy `anon`/`service_role` JWT. Приложение
   работает с любыми, но подставлять надо те, что реально показывает Dashboard → API Keys.
5. **Мажорная версия Postgres нового проекта** (Dashboard → Infrastructure) — под неё берётся
   образ докера в шаге 5.

## 2. Дампы

```bash
mkdir -p backups/$(date +%Y-%m-%d)-region && cd backups/$(date +%Y-%m-%d)-region
# пароль percent-encoded
export OLD_DB_URL='postgresql://postgres.dnlburbuchxzxdmhuczu:<OLD_PASS>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres'

npx supabase db dump --db-url "$OLD_DB_URL" -f roles.sql  --role-only
npx supabase db dump --db-url "$OLD_DB_URL" -f schema.sql
npx supabase db dump --db-url "$OLD_DB_URL" -f data.sql --use-copy --data-only \
  -x storage.objects -x storage.buckets -x storage.prefixes \
  -x storage.s3_multipart_uploads -x storage.s3_multipart_uploads_parts \
  -x storage.buckets_vectors -x storage.vector_indexes

# история миграций — иначе `supabase db push` в новом проекте начнёт применять всё с нуля
npx supabase db dump --db-url "$OLD_DB_URL" -f history_schema.sql --schema supabase_migrations
npx supabase db dump --db-url "$OLD_DB_URL" -f history_data.sql --use-copy --data-only --schema supabase_migrations
```

Дампы лежат в `backups/` — он git-ignored, и не случайно: в них имена, телефоны и адреса
покупателей.

Почему исключены `storage.*`: дамп данных Supabase CLI включает схемы `auth` и `storage` (исключены
только их таблицы миграций), то есть привёз бы строки `storage.objects` — описания файлов, которых в
новом бакете нет. Файлы копирует шаг 4, и он же создаёт строки. Импорт чужих строк поверх — конфликт
по ключу, а `storage.prefixes` при restore не наполнится вовсе: `session_replication_role = replica`
глушит триггеры.

Проверка, что `auth` действительно в дампе:

```bash
grep -c 'COPY "auth"."users"' data.sql   # должно быть 1
```

## 3. Настройка нового проекта в дашборде

До restore, чтобы после переключения ничего не досоздавать:

- **Authentication → URL Configuration:** Site URL `https://aloe.kg`; Redirect URLs — `https://aloe.kg/**`,
  превью-домены Vercel, `http://localhost:3000/**`.
- **Authentication → Providers → Google:** тот же client ID и secret, что на старом проекте.
  В Google Cloud Console у того же OAuth-клиента добавить Authorized redirect URI
  `https://<NEW_REF>.supabase.co/auth/v1/callback` (старый пока не убирать — он нужен для отката).
- **Authentication → Emails:** SMTP-отправитель и шаблоны писем (подтверждение регистрации, OTP) —
  перенести руками, сверяясь со старым проектом.
- **Authentication → Sign In / Providers:** подтверждение email, автоподтверждение — как на старом.

## 4. Копирование Storage (до окна, можно повторять)

```bash
node scripts/migrate-storage.mjs --from=prod --to=new             # что будет скопировано
node scripts/migrate-storage.mjs --from=prod --to=new --execute --concurrency=24
```

Выполнено 21 сентября 2026: 6955 объектов из 6957, ~15 минут при `--concurrency=24` (на дефолтных
8 выходило 1,7 объекта/с, то есть больше часа — Мумбай далеко). Не поехали ровно два объекта, и это
правильно: `product-images/inline/.emptyFolderPlaceholder` и `banners/.emptyFolderPlaceholder` —
служебные пустышки дашборда с `content-type: application/octet-stream`, которого нет в mime-списке
бакета. Содержимого в них нет, ссылок на них тоже.

Скрипт создаёт бакеты с настройками старого проекта (public, file_size_limit, allowed_mime_types),
копирует всё рекурсивно (`thumb/`, `inline/`, `specials/`), ничего не удаляет и пропускает уже
лежащее с тем же размером — то есть после обрыва достаточно запустить его снова. Повторный прогон
перед окном дочерпнёт то, что админ загрузил за это время.

## 5. Окно (15–30 минут)

Записи в старую БД между шагом 2 и шагом 7 останутся только там, поэтому окно короткое, а не
«на вечер». Дельта проверяется в шаге 8.

```bash
export NEW_DB_URL='postgresql://postgres.<NEW_REF>:<NEW_PASS>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'

# psql локально не установлен — берём его из образа с мажорной версией нового проекта
docker run --rm -i -v "$PWD:/dumps" -w /dumps postgres:17-alpine psql \
  --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$NEW_DB_URL" > restore.out 2>&1; echo "psql: $?"

docker run --rm -i -v "$PWD:/dumps" -w /dumps postgres:17-alpine psql \
  --single-transaction --variable ON_ERROR_STOP=1 \
  --file history_schema.sql --file history_data.sql --dbname "$NEW_DB_URL"
```

**Вывод `psql` перенаправлять в файл, а не в конвейер.** На репетиции `psql … | grep … | head -30`
закрыл поток на тридцатой строке, `psql` получил SIGPIPE и умер посреди транзакции — restore
откатился целиком, а в логе остались только безобидные предупреждения. Транзакция отработала как
надо (проект остался пустым), но полчаса ушло на поиск ошибки, которой не было. И `$?` в конвейере —
это код последней команды, то есть `head`, а не `psql`.

Предупреждения `no privileges were granted for "gtrgm_…"` — норма: дамп выдаёт гранты на внутренние
функции `pg_trgm`, владелец которых расширение.

Историю миграций грузить **отдельной** командой, как выше: при повторном restore её таблицу надо
сперва очистить, иначе конфликт по `version`.

Грабли, описанные в гайде Supabase, — если вылезут, правятся в дампе и запускаются снова:

- `permission denied to grant role "postgres"` → закомментировать в `roles.sql` строку
  `GRANT "postgres" TO "cli_login_postgres" …`;
- ошибки прав вокруг `supabase_admin` → закомментировать строки `ALTER … OWNER TO "supabase_admin"`
  в `schema.sql`.

После restore проверить расширение поиска:

```sql
select extname from pg_extension where extname = 'pg_trgm';
```

### Обнуление копии перед повторным restore

Нужно только потому, что репетиция уже загрузила данные в новый проект: `COPY` поверх существующих
строк — конфликт по ключу. Выполняется в SQL Editor **нового** проекта (или через `psql`), и только
там — против рабочей базы этот блок недопустим.

```sql
set session_replication_role = replica;  -- FK это тоже триггеры: порядок удаления перестаёт мешать
drop schema if exists public cascade;    -- забирает с собой и pg_trgm, schema.sql создаст заново
create schema public;
-- строки схемы auth, которые data.sql импортирует снова
delete from auth.identities;
delete from auth.sessions;
delete from auth.refresh_tokens;
delete from auth.mfa_factors;
delete from auth.mfa_amr_claims;
delete from auth.mfa_challenges;
delete from auth.one_time_tokens;
delete from auth.flow_state;
delete from auth.audit_log_entries;
delete from auth.users;
truncate supabase_migrations.schema_migrations;
reset all;
```

Если какая-то таблица `auth.*` в дампе непустая и здесь не перечислена, `COPY` упадёт по
дублирующему ключу — список составлен по `grep 'COPY "auth"' data.sql` того дампа, который
восстанавливается.

## 6. Переписать URL картинок

`image_url`/`thumbnail_url` хранят абсолютные URL, и то же имя проекта сидит в Markdown-описаниях
(картинки под `inline/`) и в замороженных `orders.items`. Заполнить два хоста и выполнить:

```bash
sed -e 's/OLD_REF/dnlburbuchxzxdmhuczu/g' -e 's/NEW_REF/<NEW_REF>/g' \
  ../../supabase/sql/rewrite-storage-urls.sql > rewrite-filled.sql

docker run --rm -i -v "$PWD:/dumps" -w /dumps postgres:17-alpine psql \
  --variable ON_ERROR_STOP=1 --file rewrite-filled.sql --dbname "$NEW_DB_URL"
```

Скрипт — одна транзакция, и сам же в конце проверяет, что ни одной ссылки на старый хост не
осталось (иначе откатывается). Альтернатива без докера: вставить заполненный файл в SQL Editor
нового проекта.

На репетиции переписал `products` 3164, `categories` 10, `banners` 2, `orders` 34 — и после этого
все шесть видов ссылок отдавались новым хостом с `200 image/webp`: обычная картинка, `thumb/`,
категория, баннер, картинка из замороженного `orders.items` и `inline/`-картинка из
Markdown-описания.

## 7. Переключение приложения

1. **Vercel → Production env:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` → новый проект. `DEPLOY_ORIGIN` остаётся не выставленным.
2. **Redeploy**, а не рестарт: CSP (`lib/csp.ts`) и `SPECIALS_BASE_URL` вшиваются в билд.
3. **Код** — ветка `chore/supabase-region-migration`, PR в `main`: ref упомянут в
   `package.json` (`db:link:prod`), `scripts/lib/target.mjs` (`PROD_REF`), `lib/constants.ts`
   (`SPECIALS_BASE_URL`), `lib/csp.ts` (`PRODUCTION_SUPABASE_ORIGIN`), `tests/csp.test.ts`,
   `.env.example`, `README.md`, `CODEBASE.md`, `supabase/README.md`.
4. **Локально:** `.env.prod` → новый проект, затем `npm run db:types:prod && npm run typecheck`
   (типы должны не измениться — это и есть доказательство, что схема переехала целиком).

## 8. Проверка

```bash
node scripts/compare-projects.mjs --from=prod --to=new
```

Все счётчики должны совпасть (кроме `rate_limits` — это счётчик окна, он живёт своей жизнью).
`newest created_at` по `orders`, `favorites`, `cart_items`, `profiles` — то самое место, где видно
запись, прилетевшую в Мумбай во время окна; такие строки переносятся руками.

Руками на сайте: вход по email+пароль (пароли сохранились), вход через Google, карточка товара
(картинка отдаётся с нового хоста), корзина, оформление заказа (письмо админу + PDF), админка
(правка товара, загрузка фото → файл падает в новый бакет), `/popular`, `/search` (упрётся в
`pg_trgm`), `/sitemap.xml`, `/robots.txt` (должен быть без `Disallow: /`).

## 9. Откат

Вернуть три env-переменные на старый проект и сделать redeploy. Старый проект всё это время живой и
нетронутый — restore идёт только в новый, дампы читаются, а `migrate-storage.mjs` ничего не удаляет.
Цена отката — заказы, оформленные уже после переключения: их придётся перенести в старую БД руками
(они есть в письме админу с PDF).

## 10. После

- **Старый проект не удалять минимум две недели.** Перед удалением: `grep -rn dnlburbuchxzxdmhuczu`
  по репозиторию должен быть чистым, а read-only проверка в конце
  `supabase/sql/rewrite-storage-urls.sql` — давать нули по всем таблицам.
- **Staging.** Проект из `.env.local` (`puqmkruyhjfvhyjfriig`) на 21 сентября 2026 уже удалён —
  хост не разрешается. Если stage поднимается заново, сидить его из свежего дампа нового прода
  (`npm run backup:prod` → `npm run seed:stage`), и учесть, что `lib/csp.ts` и `SPECIALS_BASE_URL`
  после переезда указывают на новый прод — картинки staging будет читать уже из Франкфурта.
- Обновить регион и ref в `README.md`, `CODEBASE.md`, `supabase/README.md`, `.env.example`.
