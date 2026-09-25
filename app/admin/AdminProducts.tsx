"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import Pagination from "@/components/Pagination";
import type { ProductRecord } from "@/types";
import {
  bulkUpdateProducts,
  deleteProduct,
  getBrands,
  uploadProductImage,
  upsertProduct,
  type BulkProductUpdate,
  type ProductInput,
} from "./actions";
import BulkEditDrawer from "./BulkEditDrawer";
import ProductEditDrawer from "./ProductEditDrawer";
import ProductFilterBar from "./ProductFilterBar";
import ProductList from "./ProductList";
import ProductSearchBar from "./ProductSearchBar";
import { useAdminListNav, useDebouncedSearch } from "./useAdminListNav";

const empty: ProductInput = {
  name: "",
  price: 0,
  old_price: null,
  image_url: "",
  thumbnail_url: null,
  category: "",
  category_id: 0,
  label: null,
  description: null,
  brand_id: null,
  seo_text: null,
  published: true,
};

export type SortBy = "id-desc" | "name-asc" | "price-asc" | "price-desc" | "purchase-count-desc";

type Props = {
  products: ProductRecord[];
  page: number;
  totalPages: number;
  total: number;
  q: string;
  label: string;
  published: string;
  category: string;
  sort: SortBy;
  pageSize: string;
  categories: { id: number; name: string; depth: number; selectable: boolean }[];
};

export default function AdminProducts({
  products,
  page,
  totalPages,
  total,
  q,
  label,
  published,
  category,
  sort,
  pageSize,
  categories,
}: Props) {
  const router = useRouter();
  const navigateRaw = useAdminListNav({ sort: "id-desc", pageSize: "20" });

  const [editing, setEditing] = useState<ProductInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [brands, setBrands] = useState<{ id: number; name: string }[]>([]);
  const brandsLoadedRef = useRef(false);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkEditing, setBulkEditing] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState("");

  function navigate(updates: Parameters<typeof navigateRaw>[0]) {
    setSelectedIds(new Set());
    navigateRaw(updates);
  }
  const search = useDebouncedSearch(q, (value) => navigate({ q: value }));

  async function loadBrands() {
    if (brandsLoadedRef.current) return;
    brandsLoadedRef.current = true;
    const result = await getBrands();
    if (result.ok) setBrands(result.data);
  }

  function openNew() {
    setEditing({ ...empty });
    setError("");
    loadBrands();
  }

  function openEdit(p: ProductRecord) {
    loadBrands();
    setEditing({
      id: p.id,
      name: p.name,
      price: p.price ?? 0,
      old_price: p.old_price ?? null,
      image_url: p.image_url ?? "",
      thumbnail_url: p.thumbnail_url ?? null,
      category: p.category ?? "",
      category_id: p.category_id ?? 0,
      label: p.label === "new" || p.label === "sale" ? p.label : null,
      description: p.description ?? null,
      brand_id: p.brand_id ?? null,
      seo_text: p.seo_text ?? null,
      published: p.published ?? false,
    });
    setError("");
  }

  function close() {
    setEditing(null);
    setError("");
  }

  function set<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleImageFile(file: File) {
    setUploading(true);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    const result = await uploadProductImage(fd);
    setUploading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Set both together so a card never points at the large file.
    setEditing((prev) => (prev ? { ...prev, image_url: result.url, thumbnail_url: result.thumbnailUrl } : prev));
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError("");
    const result = await upsertProduct(editing);
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    close();
    router.refresh();
  }

  async function handleDelete(id: number) {
    if (!confirm("Удалить товар?")) return;
    const result = await deleteProduct(id);
    if (!result.ok) {
      alert(result.error);
      return;
    }
    router.refresh();
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (products.every((p) => prev.has(p.id)) ? new Set() : new Set(products.map((p) => p.id))));
  }

  function openBulkEdit() {
    loadBrands();
    setBulkError("");
    setBulkEditing(true);
  }

  async function saveBulk(fields: BulkProductUpdate) {
    setBulkSaving(true);
    setBulkError("");
    const result = await bulkUpdateProducts([...selectedIds], fields);
    setBulkSaving(false);
    if (!result.ok) {
      setBulkError(result.error);
      return;
    }
    setBulkEditing(false);
    setSelectedIds(new Set());
    router.refresh();
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">Товаров: {total}</p>
        <Button variant="primary" onClick={openNew} className="flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          Добавить товар
        </Button>
      </div>

      <ProductSearchBar value={search.value} onChange={search.onChange} onClear={search.clear} />

      <ProductFilterBar
        label={label}
        published={published}
        category={category}
        categories={categories}
        sort={sort}
        onLabelChange={(value) => navigate({ label: value })}
        onPublishedChange={(value) => navigate({ published: value })}
        onCategoryChange={(value) => navigate({ category: value })}
        onSortChange={(value) => navigate({ sort: value })}
      />

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <p className="text-sm text-green-800">Выбрано: {selectedIds.size}</p>
          <Button
            variant="primary"
            onClick={openBulkEdit}
            className="ml-auto px-3 py-1 text-xs font-medium rounded-full"
          >
            Редактировать
          </Button>
          <Button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1 text-xs font-medium rounded-full border border-gray-300 text-gray-600 hover:border-gray-500"
          >
            Отменить выбор
          </Button>
        </div>
      )}

      <ProductList
        products={products}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={toggleSelectAll}
        onEdit={openEdit}
        onDelete={handleDelete}
      />

      <Pagination page={page} totalPages={totalPages} onPageChange={(p) => navigate({ page: p })} />

      <div className="flex items-center justify-center gap-2 mt-3">
        <span className="text-xs text-gray-500">На странице:</span>
        <select
          value={pageSize}
          onChange={(e) => navigate({ pageSize: e.target.value })}
          className="border border-gray-500 rounded-lg px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-700 hover:cursor-pointer"
        >
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="all">Все</option>
        </select>
      </div>

      {editing && (
        <ProductEditDrawer
          editing={editing}
          brands={brands}
          categories={categories}
          saving={saving}
          uploading={uploading}
          error={error}
          onClose={close}
          onChange={set}
          onFileSelect={handleImageFile}
          onSave={save}
        />
      )}

      {bulkEditing && (
        <BulkEditDrawer
          count={selectedIds.size}
          brands={brands}
          categories={categories}
          saving={bulkSaving}
          error={bulkError}
          onClose={() => setBulkEditing(false)}
          onSave={saveBulk}
        />
      )}
    </>
  );
}
