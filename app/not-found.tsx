import Link from "next/link";
import { MainContainer, Title } from "@/components";

export const metadata = {
  title: "Страница не найдена",
  robots: { index: false, follow: true },
};

const LINKS = [
  { href: "/catalog", label: "Каталог" },
  { href: "/popular", label: "Популярное" },
  { href: "/new", label: "Новинки" },
  { href: "/sale", label: "Акции" },
  { href: "/brands", label: "Бренды" },
];

export default function NotFound() {
  return (
    <MainContainer className="max-w-lg text-center pt-24">
      <p className="text-5xl font-bold text-green-700">404</p>
      <Title className="mt-3 mb-2">Страница не найдена</Title>
      <p className="text-gray-500 text-sm mb-8">Возможно, товар был снят с продажи или в ссылке допущена опечатка.</p>
      <div className="flex flex-wrap gap-2 justify-center">
        {LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            {label}
          </Link>
        ))}
      </div>
      <Link
        href="/"
        className="mt-4 inline-block px-4 py-2 bg-green-700 text-white rounded-lg text-sm hover:bg-green-800 transition-colors"
      >
        На главную
      </Link>
    </MainContainer>
  );
}
