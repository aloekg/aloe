# Переезд на aloe.kg — выполнен

`aloe.kg` отдаёт этот деплой (Vercel), старый Joomla + JoomShopping живёт на `old.aloe.kg`.
Проверено 14 сентября 2026. Осталось три хвоста — ниже, первый из них срочный.

## Проверено и работает

- `aloe.kg` → Vercel (A `216.198.79.1`), отдаёт Next-сборку.
- 301 старых ссылок: `https://aloe.kg/catalog/product/view/21/6865.html` → `https://aloe.kg/product/9993`
  ([app/catalog/product/view/[...path]/route.ts](app/catalog/product/view/%5B...path%5D/route.ts)).
- `https://aloe.kg/sitemap.xml` открывается и содержит `aloe.kg`-адреса.
- **Почта не уехала вместе с апексом:** MX `aloe.kg` → `mail.aloe.kg` → `176.126.165.130` (hoster.kg),
  то есть уведомления о заказах ходят по-прежнему.
- `old.aloe.kg` поднят и открывается — на него ссылается футер (`LEGACY_SITE_URL`).

## Осталось

### 1. Снять `noindex` с продакшена — сейчас магазин закрыт от поисковиков

`https://aloe.kg/robots.txt` отдаёт `Disallow: /`, и в `<head>` каждой страницы стоит
`<meta name="robots" content="noindex, nofollow">`. Это значит, что в Vercel → Production всё ещё
выставлен `DEPLOY_ORIGIN=https://new.aloe.kg`: пока он не равен `SITE_URL`, деплой считает себя
неканоническим хостом ([lib/deploy-origin.ts](lib/deploy-origin.ts), [app/robots.ts](app/robots.ts),
[app/layout.tsx](app/layout.tsx)).

- [ ] Vercel → Settings → Environment Variables → удалить `DEPLOY_ORIGIN` из Production
      (или выставить `https://aloe.kg`).
- [ ] **Redeploy обязателен** — `robots.ts`, `sitemap.ts` и metadata статические, без пересборки
      останутся закэшированные значения.
- [ ] Проверить: `curl https://aloe.kg/robots.txt` → обычные правила и
      `Sitemap: https://aloe.kg/sitemap.xml`; в HTML главной нет `noindex`.

### 2. Закрыть `old.aloe.kg` от индексации

Сейчас там стоковый Joomla-`robots.txt` (закрыты только служебные папки), то есть весь каталог
открыт для краулеров. Это полный дубль контента `aloe.kg` на своём домене — две площадки будут
конкурировать в выдаче за одни и те же товары.

- [ ] `Disallow: /` или `noindex` на старом сайте.

### 3. `new.aloe.kg` отдаёт 404

DNS всё ещё смотрит на Vercel, но домен из проекта убран — вместо 301 на `aloe.kg` посетитель
получает 404. Если поддомен успел попасть в индекс или на него есть внешние ссылки:

- [ ] Вернуть `new.aloe.kg` в проект как редирект на `aloe.kg` (не как отдельный деплой).

## Мелочи, когда дойдут руки

- [ ] Supabase Dashboard → Authentication → URL Configuration: `Site URL = https://aloe.kg`,
      из `Redirect URLs` убрать `https://new.aloe.kg/**`. В
      [supabase/config.toml](supabase/config.toml) он уже убран, но источник истины — дашборд,
      пока конфиг не запушен.
- [ ] Search Console: после снятия `noindex` (п. 1) отправить sitemap для `aloe.kg`; добавить
      `old.aloe.kg` и следить, что старые URL отдают 301, а не 404.
- [ ] Прогреть ISR-кэш и OG-картинки заходом на основные страницы.

Когда закрыты пункты 1–3, этот файл можно удалить — ссылка на него есть в
[README.md](README.md).
