# Переезд на aloe.kg — выполнен

`aloe.kg` отдаёт этот деплой (Vercel), старый Joomla + JoomShopping живёт на `old.aloe.kg`.
Проверено 14 сентября 2026.

## Сделано

- `aloe.kg` → Vercel, магазин открывается.
- `DEPLOY_ORIGIN` убран из Production: `robots.txt` отдаёт обычные правила и
  `Sitemap: https://aloe.kg/sitemap.xml`, `noindex` со страниц снят, ссылка в письме админу о
  заказе ведёт на `aloe.kg/admin/orders`. На продакшене переменная должна оставаться **не
  выставленной** — она только для превью-деплоев ([lib/deploy-origin.ts](lib/deploy-origin.ts)).
- 301 старых ссылок: `/catalog/product/view/21/6865.html` → `/product/9993`
  ([app/catalog/product/view/[...path]/route.ts](app/catalog/product/view/%5B...path%5D/route.ts)).
- `old.aloe.kg` закрыт от индексации через `<meta name="robots" content="noindex, nofollow">`.
  `robots.txt` там намеренно **оставлен открытым**: запрет обхода помешал бы краулеру увидеть сам
  `noindex`, и уже проиндексированные страницы остались бы в выдаче.
- Почта не уехала вместе с апексом: MX `aloe.kg` → `mail.aloe.kg` → `176.126.165.130` (hoster.kg).
- `new.aloe.kg` удалён и из проекта Vercel, и из DNS-зоны (`ns5.hoster.kg` отдаёт `NXDOMAIN`) —
  от поддомена отказались, редирект не делаем.

## Осталось

- [ ] Supabase Dashboard → Authentication → URL Configuration: `Site URL = https://aloe.kg`, из
      `Redirect URLs` убрать `https://new.aloe.kg/**`. В [supabase/config.toml](supabase/config.toml)
      он уже убран, но источник истины — дашборд, пока конфиг не запушен.
- [ ] Search Console: отправить `https://aloe.kg/sitemap.xml` (2631 URL), добавить `old.aloe.kg`,
      проверить, что старые URL отдают 301, а не 404.
- [ ] Прогреть ISR-кэш и OG-картинки заходом на основные страницы.

Когда эти четыре закрыты, файл можно удалить — ссылка на него есть в [README.md](README.md).
