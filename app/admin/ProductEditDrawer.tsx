"use client";

import { useRef } from "react";
import type { ProductInput } from "./actions";
import { Field, adminInputCls as inp } from "./admin-ui";
import AdminDrawer from "./AdminDrawer";
import DescriptionImageButton from "./DescriptionImageButton";
import ImageDropzone from "./ImageDropzone";

const LABELS = [
  { value: "", label: "Нет" },
  { value: "new", label: "Новинка" },
  { value: "sale", label: "Акция" },
];

type Props = {
  editing: ProductInput;
  brands: { id: number; name: string }[];
  categories: { id: number; name: string; depth: number; selectable: boolean }[];
  saving: boolean;
  uploading: boolean;
  error: string;
  onClose: () => void;
  onChange: <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => void;
  onFileSelect: (file: File) => void;
  onSave: () => void;
};

export default function ProductEditDrawer({
  editing,
  brands,
  categories,
  saving,
  uploading,
  error,
  onClose,
  onChange,
  onFileSelect,
  onSave,
}: Props) {
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Drops `snippet` where the caret is, rather than appending, so an image can be placed between
   * two paragraphs. The textarea is controlled, so the caret has to be restored after React has
   * rendered the new value — otherwise it jumps to the end and the next insert lands in the wrong
   * place. Falls back to appending if the field was never focused.
   */
  function insertIntoDescription(snippet: string) {
    const el = descriptionRef.current;
    const current = editing.description ?? "";

    if (!el) {
      onChange("description", current ? `${current}\n\n${snippet}` : snippet);
      return;
    }

    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? start;
    onChange("description", `${current.slice(0, start)}${snippet}${current.slice(end)}`);

    requestAnimationFrame(() => {
      el.focus();
      // Between the brackets of `![](…)`, where the alt text goes.
      const caret = start + 2;
      el.setSelectionRange(caret, caret);
    });
  }

  return (
    <AdminDrawer
      title={editing.id ? "Редактировать товар" : "Добавить товар"}
      onClose={onClose}
      saving={saving}
      onSave={onSave}
      saveDisabled={uploading || !editing.name || !editing.price}
      error={error}
      wide
    >
      <ImageDropzone imageUrl={editing.image_url} uploading={uploading} onFileSelect={onFileSelect} />

      <Field label="Название *">
        <input
          value={editing.name}
          onChange={(e) => onChange("name", e.target.value)}
          className={inp}
          placeholder="Например: Масло оливковое Extra Virgin"
        />
      </Field>

      <Field label="Производитель">
        <select
          value={editing.brand_id ?? ""}
          onChange={(e) => onChange("brand_id", e.target.value ? Number(e.target.value) : null)}
          className={inp}
        >
          <option value="">Не указан</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Категория *">
          <select
            value={categories.some((c) => c.selectable && c.id === editing.category_id) ? editing.category_id : ""}
            onChange={(e) => {
              const cat = categories.find((c) => c.selectable && String(c.id) === e.target.value);
              if (cat) {
                onChange("category_id", cat.id);
                onChange("category", cat.name);
              }
            }}
            className={inp}
          >
            <option value="" disabled>
              Выберите
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id} disabled={!c.selectable}>
                {"--".repeat(c.depth) + c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Метка">
          <select
            value={editing.label ?? ""}
            onChange={(e) => onChange("label", (e.target.value as ProductInput["label"]) || null)}
            className={inp}
          >
            {LABELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Цена *">
          <input
            type="number"
            value={editing.price || ""}
            onChange={(e) => onChange("price", Number(e.target.value))}
            className={inp}
            placeholder="0"
            min={0}
          />
        </Field>
        <Field label="Старая цена">
          <input
            type="number"
            value={editing.old_price ?? ""}
            onChange={(e) => onChange("old_price", e.target.value ? Number(e.target.value) : null)}
            className={inp}
            placeholder="0"
            min={0}
          />
        </Field>
      </div>

      <Field label="Описание (Markdown)" action={<DescriptionImageButton onInsert={insertIntoDescription} />}>
        <textarea
          ref={descriptionRef}
          value={editing.description ?? ""}
          onChange={(e) => onChange("description", e.target.value || null)}
          className={`${inp} min-h-35 resize-y font-mono text-xs`}
          placeholder={"## Заголовок\n\nОписание товара..."}
        />
      </Field>

      <Field label="SEO текст (keywords / title / description)">
        <textarea
          value={editing.seo_text ?? ""}
          onChange={(e) => onChange("seo_text", e.target.value || null)}
          className={`${inp} min-h-24 resize-y text-xs`}
          placeholder="Текст для мета-тегов keywords, title и description"
        />
      </Field>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={editing.published ?? true}
          onChange={(e) => onChange("published", e.target.checked)}
          className="w-4 h-4 accent-green-600"
        />
        <span className="text-sm font-medium text-gray-700">Опубликован</span>
      </label>
    </AdminDrawer>
  );
}
