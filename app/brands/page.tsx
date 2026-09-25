import Link from "next/link";
import { MainContainer, MobileHeader, Title } from "@/components";
import { getCachedBrands } from "@/lib/cached-queries";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Бренды",
  description: "Все бренды бытовой химии и косметики, представленные в интернет-магазине Aloe.kg.",
  path: "/brands",
});

export default async function BrandsPage() {
  const list = await getCachedBrands();

  const grouped = list.reduce<Record<string, typeof list>>((acc, brand) => {
    // name can be blank: upsertBrand validates nothing.
    const letter = brand.name?.trim()?.[0]?.toUpperCase() ?? "#";
    (acc[letter] ??= []).push(brand);
    return acc;
  }, {});

  const letters = Object.keys(grouped).sort((a, b) => a.localeCompare(b, "ru"));

  return (
    <>
      <MobileHeader title="Бренды" />
      <MainContainer>
        <Title className="hidden md:block mb-4">Бренды</Title>

        {list.length === 0 && <p className="text-gray-500 text-sm">Бренды не найдены</p>}

        <div className="sticky top-15 md:top-41.5 bg-white flex flex-wrap gap-1 py-2 mb-4 md:mb-6">
          {letters.map((letter) => (
            <a
              key={letter}
              href={`#letter-${letter}`}
              className="w-8 h-8 flex items-center justify-center text-sm font-medium rounded border border-gray-300 hover:border-green-600 hover:text-green-700 transition-colors"
            >
              {letter}
            </a>
          ))}
        </div>

        <div className="space-y-8">
          {letters.map((letter) => (
            <section
              key={letter}
              id={`letter-${letter}`}
              className="scroll-mt-56 sm:scroll-mt-46 md:scroll-mt-64 2xl:md:scroll-mt-54"
            >
              <h2 className="text-lg font-semibold text-green-700 border-b border-gray-200 pb-1 mb-3">{letter}</h2>
              <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {grouped[letter].map((brand) => (
                  <li key={brand.id}>
                    <Link
                      href={`/brands/${brand.slug}`}
                      className="block text-sm text-gray-700 hover:text-green-700 hover:underline transition-colors truncate"
                    >
                      {brand.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </MainContainer>
    </>
  );
}
