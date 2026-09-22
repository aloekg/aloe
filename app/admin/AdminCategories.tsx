"use client";

import { useMemo, useRef, useState } from "react";
import {
  ChevronRightIcon,
  GripVerticalIcon,
  ImagePlusIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import Image from "next/image";
import Button from "@/components/Button";
import { useToast } from "@/store/toast";
import type { Category } from "@/types";
import {
  deleteCategory,
  reorderSubcategories,
  uploadCategoryImage,
  upsertCategory,
  type CategoryInput,
} from "./actions";
import { Field, adminInputCls as inp } from "./admin-ui";
import AdminDrawer from "./AdminDrawer";
import { useDragReorder } from "./useDragReorder";

const empty: CategoryInput = { name: "", parent_id: null, slug: "", image_url: null };

export default function AdminCategories({
  categories: initial,
  usedCategoryIds: usedIds,
}: {
  categories: Category[];
  usedCategoryIds: number[];
}) {
  const [categories, setCategories] = useState(initial);
  const [editing, setEditing] = useState<(CategoryInput & { isNew: boolean }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const show = useToast((s) => s.show);
  const drag = useDragReorder();

  // One pass over the tree instead of three nested scans plus a recursive full-array walk per
  // rendered row — all of which re-ran on every keystroke in the edit drawer.
  const { parents, subs, childrenOf, lockedIds } = useMemo(() => {
    const childrenOf = new Map<number, Category[]>();
    const parents: Category[] = [];
    for (const c of categories) {
      if (c.parent_id == null) parents.push(c);
      else {
        if (!childrenOf.has(c.parent_id)) childrenOf.set(c.parent_id, []);
        childrenOf.get(c.parent_id)!.push(c);
      }
    }
    const subs = parents.flatMap((p) => childrenOf.get(p.id) ?? []);

    // A category is locked when it, or anything beneath it, holds a product.
    const used = new Set(usedIds);
    const lockedIds = new Set<number>();
    const walk = (c: Category): boolean => {
      const locked = used.has(c.id) || (childrenOf.get(c.id) ?? []).map(walk).some(Boolean);
      if (locked) lockedIds.add(c.id);
      return locked;
    };
    parents.forEach(walk);

    return { parents, subs, childrenOf, lockedIds };
  }, [categories, usedIds]);

  const isLocked = (id: number) => lockedIds.has(id);

  function openNew(parentId: number | null = null) {
    setEditing({ ...empty, parent_id: parentId, isNew: true });
    setError("");
  }

  function openEdit(c: Category) {
    setEditing({
      id: c.id,
      name: c.name,
      parent_id: c.parent_id,
      slug: c.slug,
      image_url: c.image_url ?? null,
      isNew: false,
    });
    setError("");
  }

  async function handleImageFile(file: File) {
    setUploading(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    const result = await uploadCategoryImage(fd);
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing((prev) => (prev ? { ...prev, image_url: result.url } : prev));
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleImageFile(file);
    e.target.value = "";
  }

  function close() {
    setEditing(null);
    setError("");
  }

  function set<K extends keyof CategoryInput>(key: K, value: CategoryInput[K]) {
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!editing) return;
    if (!editing.slug.trim() || !editing.name.trim()) {
      setError("Slug и название обязательны");
      return;
    }
    setSaving(true);
    setError("");
    const result = await upsertCategory({
      id: editing.id,
      name: editing.name.trim(),
      parent_id: editing.parent_id,
      slug: editing.slug.trim(),
      image_url: editing.image_url ?? null,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    const updated = {
      name: editing.name.trim(),
      parent_id: editing.parent_id,
      slug: editing.slug.trim(),
      image_url: editing.image_url ?? null,
    };
    setCategories((prev) => {
      const exists = prev.find((c) => c.id === editing.id);
      if (exists) return prev.map((c) => (c.id === editing.id ? { ...c, ...updated } : c));
      const siblingCount = prev.filter((c) => c.parent_id === editing.parent_id).length;
      return [...prev, { id: result.id, sort_order: siblingCount, ...updated }];
    });
    close();
  }

  async function onDrop(parentId: number, dropIndex: number) {
    const children = categories.filter((c) => c.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order);
    const next = drag.onDrop(parentId, children, dropIndex);
    if (!next) return;
    const reordered = next.map((c, i) => ({ ...c, sort_order: i }));

    setCategories((prev) => {
      const others = prev.filter((c) => c.parent_id !== parentId);
      return [...others, ...reordered];
    });

    const result = await reorderSubcategories(reordered.map(({ id, sort_order }) => ({ id, sort_order })));
    if (!result.ok) show(result.error, "error");
    else show("Порядок сохранён", "success");
  }

  async function handleDelete(id: number) {
    const hasSubs = categories.some((c) => c.parent_id === id);
    if (hasSubs) {
      alert("Сначала удалите или переместите подкатегории");
      return;
    }
    if (!confirm("Удалить категорию?")) return;
    const result = await deleteCategory(id);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <>
      <div className="flex justify-between items-center mb-5">
        <p className="text-sm text-gray-500">Категорий: {categories.length}</p>
        <Button variant="primary" onClick={() => openNew(null)} className="flex items-center gap-1.5">
          <PlusIcon className="size-4" />
          Добавить категорию
        </Button>
      </div>

      <div className="space-y-1">
        {parents.map((parent) => {
          const children = [...(childrenOf.get(parent.id) ?? [])].sort((a, b) => a.sort_order - b.sort_order);
          return (
            <div key={parent.id}>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 group">
                <ChevronRightIcon className="size-4 text-gray-300 shrink-0" />
                {parent.image_url ? (
                  <div className="relative size-8 shrink-0 rounded overflow-hidden bg-gray-100">
                    <Image src={parent.image_url} alt={parent.name} fill className="object-cover" sizes="32px" />
                  </div>
                ) : (
                  <div className="size-8 shrink-0 rounded bg-gray-100" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold">{parent.name}</span>
                  <span className="text-xs text-gray-500 ml-2">{parent.slug}</span>
                </div>
                <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 md:transition-opacity">
                  <Button
                    variant="icon"
                    iconColor="green"
                    size="sm"
                    onClick={() => openNew(parent.id)}
                    title="Добавить подкатегорию"
                  >
                    <PlusIcon className="size-4" />
                  </Button>
                  <Button variant="icon" size="sm" onClick={() => openEdit(parent)}>
                    <PencilIcon className="size-4" />
                  </Button>
                  {!isLocked(parent.id) && (
                    <Button variant="icon" iconColor="danger" size="sm" onClick={() => handleDelete(parent.id)}>
                      <Trash2Icon className="size-4" />
                    </Button>
                  )}
                </div>
              </div>

              {children.map((sub, i) => {
                const grandchildren = [...(childrenOf.get(sub.id) ?? [])].sort((a, b) => a.sort_order - b.sort_order);
                return (
                  <div key={sub.id}>
                    <div
                      draggable
                      onDragStart={() => drag.onDragStart(parent.id, i)}
                      onDragOver={(e) => drag.onDragOver(e, parent.id, i)}
                      onDragLeave={drag.onDragLeave}
                      onDrop={() => onDrop(parent.id, i)}
                      onDragEnd={drag.onDragEnd}
                      className={`flex items-center gap-2 pl-6 pr-3 py-1.5 rounded-lg group transition-colors ${
                        drag.isOver(parent.id, i) ? "bg-green-50 border border-green-300" : "hover:bg-gray-50"
                      }`}
                    >
                      <GripVerticalIcon className="size-4 text-gray-300 shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-700">{sub.name}</span>
                        <span className="text-xs text-gray-500 ml-2">{sub.slug}</span>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="icon"
                          iconColor="green"
                          size="sm"
                          onClick={() => openNew(sub.id)}
                          title="Добавить под-подкатегорию"
                        >
                          <PlusIcon className="size-4" />
                        </Button>
                        <Button variant="icon" size="sm" onClick={() => openEdit(sub)}>
                          <PencilIcon className="size-4" />
                        </Button>
                        {!isLocked(sub.id) && (
                          <Button variant="icon" iconColor="danger" size="sm" onClick={() => handleDelete(sub.id)}>
                            <Trash2Icon className="size-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {grandchildren.map((subsub, j) => (
                      <div
                        key={subsub.id}
                        draggable
                        onDragStart={() => drag.onDragStart(sub.id, j)}
                        onDragOver={(e) => drag.onDragOver(e, sub.id, j)}
                        onDragLeave={drag.onDragLeave}
                        onDrop={() => onDrop(sub.id, j)}
                        onDragEnd={drag.onDragEnd}
                        className={`flex items-center gap-2 pl-12 pr-3 py-1.5 rounded-lg group transition-colors ${
                          drag.isOver(sub.id, j) ? "bg-green-50 border border-green-300" : "hover:bg-gray-50"
                        }`}
                      >
                        <GripVerticalIcon className="size-4 text-gray-300 shrink-0 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-gray-600">{subsub.name}</span>
                          <span className="text-xs text-gray-500 ml-2">{subsub.slug}</span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="icon" size="sm" onClick={() => openEdit(subsub)}>
                            <PencilIcon className="size-4" />
                          </Button>
                          {!isLocked(subsub.id) && (
                            <Button variant="icon" iconColor="danger" size="sm" onClick={() => handleDelete(subsub.id)}>
                              <Trash2Icon className="size-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {editing && (
        <AdminDrawer
          title={editing.isNew ? "Новая категория" : "Редактировать категорию"}
          onClose={close}
          saving={saving}
          onSave={save}
          error={error}
        >
          <Field label="Slug *">
            {(id) => (
              <>
                <input
                  aria-describedby={`${id}-hint`}
                  id={id}
                  value={editing.slug}
                  onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                  className={inp}
                  placeholder="bytovaya-khimiya"
                />
                <p id={`${id}-hint`} className="text-xs text-gray-500 mt-1">
                  Используется в URL: /catalog/slug
                </p>
              </>
            )}
          </Field>

          <Field label="Название *">
            {(id) => (
              <input
                id={id}
                value={editing.name}
                onChange={(e) => set("name", e.target.value)}
                className={inp}
                placeholder="Бытовая химия"
              />
            )}
          </Field>

          <Field label="Родительская категория">
            {(id) => (
              <>
                <select
                  aria-describedby={`${id}-hint`}
                  id={id}
                  value={editing.parent_id ?? ""}
                  onChange={(e) => set("parent_id", e.target.value ? parseInt(e.target.value) : null)}
                  className={inp}
                >
                  <option value="">— Верхний уровень</option>
                  {parents
                    .filter((p) => p.id !== editing.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  {subs
                    .filter((s) => s.id !== editing.id && s.parent_id !== editing.id)
                    .map((s) => {
                      const parentName = parents.find((p) => p.id === s.parent_id)?.name;
                      return (
                        <option key={s.id} value={s.id}>
                          {parentName ? `${parentName} — ${s.name}` : s.name}
                        </option>
                      );
                    })}
                </select>
                <p id={`${id}-hint`} className="text-xs text-gray-500 mt-1">
                  Выберите подкатегорию, чтобы создать под-подкатегорию (используется только для группировки товаров на
                  странице подкатегории, отдельной страницы у неё не будет)
                </p>
              </>
            )}
          </Field>

          {!editing.parent_id && (
            <Field label="Изображение">
              <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
              {editing.image_url ? (
                <div className="relative group w-full aspect-square rounded-xl overflow-hidden bg-gray-100">
                  <Image
                    src={editing.image_url}
                    alt="Изображение категории"
                    fill
                    className="object-cover"
                    sizes="400px"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      variant="icon"
                      onClick={() => !uploading && fileRef.current?.click()}
                      disabled={uploading}
                      className="bg-white/90 hover:bg-white text-gray-700"
                      title="Заменить"
                    >
                      {uploading ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <ImagePlusIcon className="size-4" />
                      )}
                    </Button>
                    <Button
                      variant="icon"
                      iconColor="danger"
                      onClick={() => set("image_url", null)}
                      className="bg-white/90 hover:bg-white"
                      title="Удалить"
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => !uploading && fileRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file && file.type.startsWith("image/")) handleImageFile(file);
                  }}
                  className="border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:border-green-600 hover:text-green-700 transition-colors cursor-pointer select-none py-8"
                >
                  {uploading ? (
                    <Loader2Icon className="size-6 animate-spin text-green-700" />
                  ) : (
                    <>
                      <ImagePlusIcon className="size-6" />
                      <span className="text-sm">Нажмите или перетащите изображение</span>
                    </>
                  )}
                </div>
              )}
            </Field>
          )}
        </AdminDrawer>
      )}
    </>
  );
}
