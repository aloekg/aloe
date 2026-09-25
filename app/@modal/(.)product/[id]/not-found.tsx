import Link from "next/link";

// Required: without it a notFound() from the page leaves the open sheet blank.
export default function ProductModalNotFound() {
  return (
    <div className="m-auto p-8 text-center">
      <p className="font-medium mb-1">Товар не найден</p>
      <p className="text-sm text-gray-500 mb-5">Возможно, он больше не продаётся.</p>
      <Link href="/catalog" className="text-sm text-green-700 hover:underline">
        Перейти в каталог →
      </Link>
    </div>
  );
}
