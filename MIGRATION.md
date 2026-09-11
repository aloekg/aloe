# Переезд на aloe.kg

Сейчас новый магазин живёт на **new.aloe.kg**, а **aloe.kg** — это старый Joomla + JoomShopping.
После тестирования домены меняются местами: `aloe.kg` → этот деплой, старый магазин → `old.aloe.kg`.

Код уже написан под финальное состояние: `SITE_URL = "https://aloe.kg"`
([lib/constants.ts](lib/constants.ts)) — на него указывают canonical, `metadataBase`, JSON-LD,
sitemap и 301-редиректы старых ссылок. Всё, что должно обращаться именно к текущему хосту, читает
`DEPLOY_ORIGIN` ([lib/deploy-origin.ts](lib/deploy-origin.ts)), поэтому переезд не требует правок в
коде — только переменные окружения и настройки в дашбордах.

## Сейчас, до переезда

- [ ] **Vercel → Environment Variables (Production):** `DEPLOY_ORIGIN=https://new.aloe.kg`,
      затем redeploy. Это включает `disallow: /` в `robots.txt` и `noindex` в `<head>`, чтобы
      тестовый домен не попал в индекс и не стал дублем будущего aloe.kg. Пока переменная не
      выставлена, `new.aloe.kg` индексируется — это осознанный fail-safe (отсутствие переменной не
      должно однажды выключить из индекса живой магазин).
- [ ] Проверить: `curl https://new.aloe.kg/robots.txt` → `Disallow: /`.
- [ ] Если `new.aloe.kg` уже в индексе — посмотреть в Search Console и после переезда закрыть
      301-редиректом на `aloe.kg`.

## День переезда

### DNS и домены

- [ ] `aloe.kg` (+ `www`) → Vercel, домен добавлен в проект и подтверждён.
- [ ] Старый магазин поднят на `old.aloe.kg` и открывается — на него ссылается футер
      (`LEGACY_SITE_URL`).
- [ ] **Почта не должна уехать вместе с апексом.** `SMTP_HOST = mail.aloe.kg`, сертификат
      `*.hoster.kg` (см. комментарий в [lib/mailer.ts](lib/mailer.ts)). Убедиться, что записи
      `mail.aloe.kg` и MX остались на hoster.kg до смены A-записи апекса. Иначе уведомления о
      заказах отвалятся — и отвалятся тихо: отправка логируется, но заказ всё равно создаётся,
      а в админке он будет помечен «отправка не подтверждена» (`orders.notified_at`).
- [ ] `new.aloe.kg` → 301 на `aloe.kg` (оставить домен в проекте как редирект, не удалять).

### Переменные окружения (Vercel, Production)

- [ ] Убрать `DEPLOY_ORIGIN` (или выставить `https://aloe.kg`) → возвращается обычный `robots.txt`,
      снимается `noindex`, ссылка в письме админу указывает на `https://aloe.kg/admin/orders`.
- [ ] Redeploy — `robots.ts`, `sitemap.ts` и metadata статические, старые значения останутся в
      кэше сборки.

### Supabase Auth

Файл [supabase/config.toml](supabase/config.toml) — это конфиг CLI; **пока он не запушен, источник
истины — дашборд**. Значения нужно проставить в Dashboard → Authentication → URL Configuration:

- [ ] `Site URL` = `https://aloe.kg` (локально это `SUPABASE_AUTH_SITE_URL`).
- [ ] `Redirect URLs`: убрать `https://new.aloe.kg/**`, оставить `https://aloe.kg/**` и локальные.
      Важно: паттерн обязательно с `/**` — Google-флоу присылает `/auth/confirm?next=/`, а точное
      совпадение без wildcard не матчит query-строку, и GoTrue молча падает на `Site URL`.
- [ ] Google OAuth (Google Cloud Console): в Authorized redirect URIs остаётся callback Supabase
      (`https://dnlburbuchxzxdmhuczu.supabase.co/auth/v1/callback`) — он не меняется; проверить,
      что в Authorized JavaScript origins есть `https://aloe.kg`.
- [ ] Синхронизировать `supabase/config.toml` с тем, что выставлено в дашборде.

### Проверки после переключения

- [ ] Вход по email и через Google на `aloe.kg` — редиректит на `aloe.kg`, не на vercel.app и не
      на `new.aloe.kg` (логика хоста — `resolveOrigin` в [lib/safe-redirect.ts](lib/safe-redirect.ts),
      правок не требует: разрешены сам `aloe.kg` и его поддомены).
- [ ] Тестовый заказ → письмо админу пришло, ссылка «Открыть заказы» ведёт на `aloe.kg/admin/orders`,
      в админке заказ не помечен «отправка не подтверждена».
- [ ] Старая ссылка вида `https://aloe.kg/catalog/product/view/21/6865.html` → 301 на
      `/product/<id>` (роут [app/catalog/product/view/[...path]/route.ts](app/catalog/product/view/%5B...path%5D/route.ts);
      до переезда его нельзя было проверить живьём).
- [ ] `https://aloe.kg/robots.txt` — обычные правила, `Sitemap: https://aloe.kg/sitemap.xml`.
- [ ] `https://aloe.kg/sitemap.xml` открывается и содержит `aloe.kg`-адреса.

### SEO

- [ ] Search Console: добавить `aloe.kg` (если ещё нет) и `old.aloe.kg`, отправить sitemap.
- [ ] **`old.aloe.kg` закрыть от индексации** — `noindex` или `Disallow: /` на старом сайте. Это
      тот же каталог на своём домене, то есть полный дубль контента: две площадки будут
      конкурировать в выдаче за одни и те же товары.
- [ ] Проверить в Search Console, что старые URL-ы `aloe.kg` отдают 301, а не 404.

## После переезда

- [ ] Убрать из этого файла выполненное или удалить файл целиком.
- [ ] Sitemap и OG-картинки прогреть заходом на страницы (ISR-кэш пустой после смены домена).
