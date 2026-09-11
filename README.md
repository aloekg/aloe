# Aloe.kg

Интернет-магазин бытовой химии и косметики в Бишкеке. Next.js 16 (App Router) + Supabase,
переписан со старого Joomla + JoomShopping.

Сайт живёт на **new.aloe.kg**; на `aloe.kg` пока работает старый магазин, он переедет на
`old.aloe.kg` — порядок переключения в [MIGRATION.md](MIGRATION.md).

## Запуск

```bash
npm install
npm run dev          # http://localhost:3000
```

Нужен `.env.local` с ключами Supabase и SMTP — список переменных в
[CODEBASE.md](CODEBASE.md#environment-variables). Файл не коммитится.

## Команды

```bash
npm run dev          npm run build        npm run start
npm run lint         npm run format       npm run typecheck
npm run test         # vitest, только чистые хелперы — без БД и DOM
npm run db:types     # перегенерировать types/database.ts из схемы
```

Перед пушем достаточно `npm run typecheck && npm run lint && npm test` — то же самое гоняет CI
([.github/workflows/ci.yml](.github/workflows/ci.yml)), плюс `format:check` и сборку.

## Где что

| файл                                     | о чём                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| [CODEBASE.md](CODEBASE.md)               | Справочник: маршруты, схема БД, сервисы, стора, серверные экшены, паттерны        |
| [AGENTS.md](AGENTS.md)                   | Правило для ИИ-агентов: это Next.js 16, читать документацию в `node_modules/next` |
| [MIGRATION.md](MIGRATION.md)             | Чеклист переезда на домен `aloe.kg`                                               |
| [supabase/README.md](supabase/README.md) | Миграции, аудит RLS, регенерация типов                                            |
| `scripts/joomla/`                        | Синхронизация каталога со старым сайтом (он пока и есть продакшен)                |
| `scripts/`, `backups/`                   | Обслуживание: картинки, потерянные категории, очистка тестовых данных, бэкапы     |

## Особенности, о которые легко споткнуться

- **Оптимизация картинок Next отключена намеренно** (`images.unoptimized: true`) — квота Vercel на
  Hobby-плане. Вместо неё у каждого товара два WebP: `thumbnail_url` (≤500px) для карточек и
  `image_url` (≤1200px) для страницы товара. Не включайте обратно и не сжимайте фото сильнее.
- **`SITE_URL` жёстко равен `https://aloe.kg`** — это целевой домен, на него смотрят canonical,
  sitemap и редиректы старых ссылок. Текущий хост задаётся `DEPLOY_ORIGIN`; пока они различаются,
  `robots.txt` отдаёт `Disallow: /` и страницы носят `noindex`.
- **Схема БД — в `supabase/migrations/`**, а не только в дашборде. После миграции обязательно
  `npm run db:types`.
- **`/api` маршрутов нет**: данные читаются прямо в серверных компонентах, запись — через серверные
  экшены.
