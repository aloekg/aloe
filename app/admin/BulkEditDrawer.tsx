"use client";

import { useState } from "react";
import type { BulkProductUpdate } from "./actions";
import { Field, adminInputCls as inp } from "./admin-ui";
import AdminDrawer from "./AdminDrawer";

const LABELS = [
  { value: "", label: "Нет" },
  { value: "new", label: "Новинка" },
  { value: "sale", label: "Акция" },
];

type Enabled = {
  category_id: boolean;
  brand_id: boolean;
  price: boolean;
  old_price: boolean;
  label: boolean;
  published: boolean;
};

type Props = {
  count: number;
  brands: { id: number; name: string }[];
  categories: { id: number; name: string; depth: number; selectable: boolean }[];
  saving: boolean;
  error: string;
  onClose: () => void;
  onSave: (fields: BulkProductUpdate) => void;
};

export default function BulkEditDrawer({ count, brands, categories, saving, error, onClose, onSave }: Props) {
  const [enabled, setEnabled] = useState<Enabled>({
    category_id: false,
    brand_id: false,
    price: false,
    old_price: false,
    label: false,
    published: false,
  });
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [brandId, setBrandId] = useState<number | null>(null);
  const [price, setPrice] = useState(0);
  const [oldPrice, setOldPrice] = useState<number | null>(null);
  const [label, setLabel] = useState<"" | "new" | "sale">("");
  const [published, setPublished] = useState(true);

  function toggle(key: keyof Enabled) {
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function handleSave() {
    const fields: BulkProductUpdate = {};
    if (enabled.category_id && categoryId !== "") {
      const cat = categories.find((c) => c.id === categoryId);
      if (cat) {
        fields.category_id = cat.id;
        fields.category = cat.name;
      }
    }
    if (enabled.brand_id) fields.brand_id = brandId;
    if (enabled.price) fields.price = price;
    if (enabled.old_price) fields.old_price = oldPrice;
    if (enabled.label) fields.label = label || null;
    if (enabled.published) fields.published = published;
    onSave(fields);
  }

  const anyEnabled = Object.values(enabled).some(Boolean);

  return (
    <AdminDrawer
      title={`Изменить товары (${count})`}
      onClose={onClose}
      saving={saving}
      onSave={handleSave}
      saveDisabled={!anyEnabled}
      error={error}
    >
      <p className="text-xs text-gray-500">Отметьте поля, которые нужно изменить у всех выбранных товаров.</p>

      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={enabled.category_id}
          onChange={() => toggle("category_id")}
          className="w-4 h-4 mt-6 shrink-0 accent-green-600"
        />
        <div className="flex-1">
          <Field label="Категория">
            {(id) => (
              <select
                id={id}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}
                disabled={!enabled.category_id}
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
            )}
          </Field>
        </div>
      </div>

      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={enabled.brand_id}
          onChange={() => toggle("brand_id")}
          className="w-4 h-4 mt-6 shrink-0 accent-green-600"
        />
        <div className="flex-1">
          <Field label="Производитель">
            {(id) => (
              <select
                id={id}
                value={brandId ?? ""}
                onChange={(e) => setBrandId(e.target.value ? Number(e.target.value) : null)}
                disabled={!enabled.brand_id}
                className={inp}
              >
                <option value="">Не указан</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </div>

      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={enabled.price}
          onChange={() => toggle("price")}
          className="w-4 h-4 mt-6 shrink-0 accent-green-600"
        />
        <div className="flex-1">
          <Field label="Цена">
            {(id) => (
              <input
                id={id}
                type="number"
                value={price || ""}
                onChange={(e) => setPrice(Number(e.target.value))}
                disabled={!enabled.price}
                className={inp}
                placeholder="0"
                min={0}
              />
            )}
          </Field>
        </div>
      </div>

      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={enabled.old_price}
          onChange={() => toggle("old_price")}
          className="w-4 h-4 mt-6 shrink-0 accent-green-600"
        />
        <div className="flex-1">
          <Field label="Старая цена">
            {(id) => (
              <input
                id={id}
                type="number"
                value={oldPrice ?? ""}
                onChange={(e) => setOldPrice(e.target.value ? Number(e.target.value) : null)}
                disabled={!enabled.old_price}
                className={inp}
                placeholder="0"
                min={0}
              />
            )}
          </Field>
        </div>
      </div>

      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={enabled.label}
          onChange={() => toggle("label")}
          className="w-4 h-4 mt-6 shrink-0 accent-green-600"
        />
        <div className="flex-1">
          <Field label="Метка">
            {(id) => (
              <select
                id={id}
                value={label}
                onChange={(e) => setLabel(e.target.value as typeof label)}
                disabled={!enabled.label}
                className={inp}
              >
                {LABELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </div>

      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={enabled.published}
          onChange={() => toggle("published")}
          className="w-4 h-4 mt-6 shrink-0 accent-green-600"
        />
        <div className="flex-1">
          <Field label="Опубликован">
            {(id) => (
              <select
                id={id}
                value={published ? "yes" : "no"}
                onChange={(e) => setPublished(e.target.value === "yes")}
                disabled={!enabled.published}
                className={inp}
              >
                <option value="yes">Да</option>
                <option value="no">Нет</option>
              </select>
            )}
          </Field>
        </div>
      </div>
    </AdminDrawer>
  );
}
