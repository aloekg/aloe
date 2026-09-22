import Link from "next/link";

/**
 * The shell now lives in the layout, so a `notFound()` from the page renders inside the open sheet.
 * Without a boundary here that sheet would be blank — the root not-found is a full page and has no
 * business appearing inside a quick view.
 */
export default function ProductModalNotFound() {
  return (
    <div className="m-auto p-8 text-center">
      <p className="font-medium mb-1">Товар не найден</p>
      <p className="text-sm text-gray-500 mb-5">Возможно, он больше не продаётся.</p>
      <Link href="/catalog" className="text-sm text-green-600 hover:underline">
        Перейти в каталог →
      </Link>
    </div>
  );
}
