"use client";

import { useState } from "react";
import { ChevronDownIcon, HelpCircleIcon } from "lucide-react";
import type { Banner } from "@/types";
import AdminBanners from "./AdminBanners";

export default function AdminBannersTabbed({
  desktopBanners,
  mobileBanners,
}: {
  desktopBanners: Banner[];
  mobileBanners: Banner[];
}) {
  const [tab, setTab] = useState<"desktop" | "mobile">("desktop");

  return (
    <div>
      <details className="group mb-5 border border-gray-200 rounded-xl">
        <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none text-sm font-medium text-gray-700 hover:text-green-700">
          <HelpCircleIcon className="size-4 shrink-0 text-gray-500 group-hover:text-green-700" />
          Инструкция: как загружать баннеры
          <ChevronDownIcon className="size-4 ml-auto shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4 pt-1 text-sm text-gray-600 space-y-2 border-t border-gray-100">
          <p>
            <b>1. Добавление баннера.</b> Нажмите «Добавить баннер» или перетащите изображение в область загрузки.
            Баннер сразу становится активным и попадает в конец списка.
          </p>
          <p>
            <b>2. Размеры изображений.</b> Для десктопа используйте соотношение сторон 6:1 (например, 1200×200 px), для
            мобильной версии — 5:2 (например, 1000×400 px). Переключайтесь между вкладками «Десктоп» и «Мобильные»,
            чтобы загрузить баннеры для каждой версии сайта отдельно.
          </p>
          <p>
            <b>3. Подгонка размера и оптимизация.</b> Если картинка не подходит под нужное соотношение сторон, можно
            попросить Gemini изменить разрешение изображения под требуемое соотношение (6:1 для десктопа, 5:2 для
            мобильной версии). После этого баннер нужно оптимизировать на сайте{" "}
            <a
              href="https://squoosh.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-700 underline hover:text-green-700"
            >
              squoosh.app
            </a>
            : загрузите картинку, в правом нижнем углу выберите формат WebP, остальные настройки можно оставить по
            умолчанию, и уже скачанный оптимизированный файл загружайте в качестве баннера.
          </p>
          <p>
            <b>4. Ссылка при клике.</b> В поле «Ссылка» под баннером укажите адрес страницы (например, каталога или
            акции), куда должен вести баннер при клике, и нажмите на галочку, чтобы сохранить. Поле можно оставить
            пустым — тогда баннер будет некликабельным. Если ссылка ведёт на страницу внутри самого сайта, не нужно
            вставлять весь адрес целиком (https://aloe.kg/...) — достаточно указать только путь после домена, например{" "}
            <code>/about</code> или <code>/catalog/gigienicheskie-sredstva</code>.
          </p>
          <p>
            <b>5. Порядок показа.</b> Баннеры чередуются в карусели в том порядке, в котором они показаны в списке.
            Чтобы изменить порядок, зажмите иконку слева от баннера (⣿) и перетащите его выше или ниже.
          </p>
          <p>
            <b>6. Скрыть или удалить.</b> Иконка «глаз» временно скрывает баннер с сайта, не удаляя его — удобно, если
            баннер понадобится снова позже. Иконка корзины удаляет баннер безвозвратно.
          </p>
        </div>
      </details>

      <div className="flex gap-0 mb-5 border-b border-gray-200">
        <button
          onClick={() => setTab("desktop")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "desktop"
              ? "border-green-600 text-green-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Десктоп
        </button>
        <button
          onClick={() => setTab("mobile")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "mobile"
              ? "border-green-600 text-green-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Мобильные
        </button>
      </div>
      {tab === "desktop" ? (
        <AdminBanners key="desktop" banners={desktopBanners} type="desktop" />
      ) : (
        <AdminBanners key="mobile" banners={mobileBanners} type="mobile" />
      )}
    </div>
  );
}
