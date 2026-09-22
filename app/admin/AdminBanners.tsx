"use client";

import { useRef, useState } from "react";
import { CheckIcon, EyeIcon, EyeOffIcon, GripVerticalIcon, ImagePlusIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import Image from "next/image";
import Button from "@/components/Button";
import { useToast } from "@/store/toast";
import type { Banner } from "@/types";
import { deleteBanner, reorderBanners, uploadBannerImage, upsertBanner, type BannerInput } from "./actions";
import { useDragReorder } from "./useDragReorder";

/** banners.active and banners.sort_order are nullable in the schema; BannerInput is not. */
function toBannerInput(banner: Banner, overrides: Partial<BannerInput> = {}): BannerInput {
  return {
    id: banner.id,
    image_url: banner.image_url,
    sort_order: banner.sort_order ?? 0,
    active: banner.active ?? false,
    link: banner.link,
    type: banner.type === "mobile" ? "mobile" : "desktop",
    ...overrides,
  };
}

export default function AdminBanners({ banners: initial, type }: { banners: Banner[]; type: "desktop" | "mobile" }) {
  const [banners, setBanners] = useState(() => [...initial].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [links, setLinks] = useState<Record<number, string>>(() =>
    Object.fromEntries(initial.map((b) => [b.id, b.link ?? ""])),
  );
  const [savingLink, setSavingLink] = useState<Record<number, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useDragReorder();
  const show = useToast((s) => s.show);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const upload = await uploadBannerImage(fd, type);
    if (!upload.ok) {
      setUploading(false);
      show(upload.error, "error");
      return;
    }

    const sort_order = banners.length;
    const result = await upsertBanner({ image_url: upload.url, sort_order, active: true, type });
    setUploading(false);
    if (!result.ok) {
      show(result.error, "error");
      return;
    }
    setBanners((prev) => [
      ...prev,
      { id: result.id, image_url: upload.url, sort_order, active: true, link: null, type, created_at: null },
    ]);
    setLinks((prev) => ({ ...prev, [result.id]: "" }));
    show("Баннер добавлен", "success");
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  async function toggleActive(banner: Banner) {
    const result = await upsertBanner(toBannerInput(banner, { active: !banner.active }));
    if (!result.ok) {
      show(result.error, "error");
      return;
    }
    setBanners((prev) => prev.map((b) => (b.id === banner.id ? { ...b, active: !b.active } : b)));
  }

  async function handleDelete(id: number) {
    if (!confirm("Удалить баннер?")) return;
    const result = await deleteBanner(id);
    if (!result.ok) {
      show(result.error, "error");
      return;
    }
    setBanners((prev) => prev.filter((b) => b.id !== id));
    show("Баннер удалён", "info");
  }

  async function onDrop(dropIndex: number) {
    const next = drag.onDrop(type, banners, dropIndex);
    if (!next) return;
    const reordered = next.map((b, i) => ({ ...b, sort_order: i }));
    setBanners(reordered);

    setSaving(true);
    const result = await reorderBanners(reordered.map(({ id, sort_order }) => ({ id, sort_order })));
    setSaving(false);
    if (!result.ok) {
      show(result.error, "error");
    } else {
      show("Порядок сохранён", "success");
    }
  }

  return (
    <>
      <div className="flex justify-between items-center mb-5">
        <p className="text-sm text-gray-500">
          Баннеров: {banners.length}
          {saving && <span className="ml-2 text-gray-500">Сохранение...</span>}
        </p>
        <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
        <Button
          variant="primary"
          onClick={() => !uploading && fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5"
        >
          {uploading ? <Loader2Icon className="size-4 animate-spin" /> : <ImagePlusIcon className="size-4" />}
          {uploading ? "Загрузка..." : "Добавить баннер"}
        </Button>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        onClick={() => !uploading && fileRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-green-600 hover:text-green-700 transition-colors hover:cursor-pointer select-none py-10 mb-5"
      >
        {uploading ? (
          <Loader2Icon className="size-8 animate-spin text-green-700" />
        ) : (
          <>
            <ImagePlusIcon className="size-8" />
            <span className="text-sm font-medium">Нажмите или перетащите изображение</span>
            <span className="text-xs">
              {type === "mobile"
                ? "Рекомендуемое соотношение 5:2 (например 1000×400)"
                : "Рекомендуемое соотношение 6:1 (например 1200×200)"}
            </span>
          </>
        )}
      </div>

      <div className="space-y-3">
        {banners.map((b, i) => (
          <div
            key={b.id}
            draggable
            onDragStart={() => drag.onDragStart(type, i)}
            onDragOver={(e) => drag.onDragOver(e, type, i)}
            onDragLeave={drag.onDragLeave}
            onDrop={() => onDrop(i)}
            onDragEnd={drag.onDragEnd}
            className={`flex items-center gap-3 border rounded-xl p-3 transition-colors ${
              drag.isOver(type, i)
                ? "border-green-400 bg-green-50"
                : b.active
                  ? "border-gray-200"
                  : "border-gray-100 bg-gray-50"
            }`}
          >
            <GripVerticalIcon className="size-4 text-gray-500 shrink-0 cursor-grab active:cursor-grabbing" />
            <div
              className={`relative shrink-0 bg-gray-100 rounded-lg overflow-hidden ${type === "mobile" ? "w-16 aspect-5/2" : "w-40 aspect-4/1 lg:aspect-6/1"}`}
            >
              <Image
                src={b.image_url}
                alt={`Баннер ${i + 1}`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 50vw, 25vw"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700 mb-1">Баннер {i + 1}</p>
              <p className="text-xs text-gray-500 mb-1.5">{b.active ? "Активен" : "Скрыт"}</p>
              <div className="flex gap-1.5">
                <input
                  type="url"
                  placeholder="Ссылка (необязательно)"
                  value={links[b.id] ?? ""}
                  onChange={(e) => setLinks((prev) => ({ ...prev, [b.id]: e.target.value }))}
                  className="flex-1 min-w-0 text-xs border border-gray-500 rounded-lg px-2 py-1 focus:outline-none focus:border-green-700"
                />
                <Button
                  variant="icon"
                  disabled={savingLink[b.id]}
                  onClick={async () => {
                    const link = (links[b.id] ?? "").trim() || null;
                    setSavingLink((prev) => ({ ...prev, [b.id]: true }));
                    const result = await upsertBanner(toBannerInput(b, { link }));
                    setSavingLink((prev) => ({ ...prev, [b.id]: false }));
                    if (result.ok) {
                      setBanners((prev) => prev.map((x) => (x.id === b.id ? { ...x, link } : x)));
                      show("Ссылка сохранена", "success");
                    } else {
                      show(result.error, "error");
                    }
                  }}
                  className={`shrink-0 ${(links[b.id] ?? "") !== (b.link ?? "") ? "text-green-700 hover:bg-green-50" : "hover:bg-gray-100"}`}
                  title="Сохранить ссылку"
                >
                  {savingLink[b.id] ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <CheckIcon className="size-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button
                variant="icon"
                onClick={() => toggleActive(b)}
                title={b.active ? "Скрыть" : "Показать"}
                className="hover:bg-gray-100"
              >
                {b.active ? <EyeIcon className="size-4" /> : <EyeOffIcon className="size-4" />}
              </Button>
              <Button variant="icon" iconColor="danger" onClick={() => handleDelete(b.id)} aria-label="Удалить баннер">
                <Trash2Icon className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
