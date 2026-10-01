import { Heart } from "lucide-react";
import Link from "next/link";
import { MainContainer, MobileHeader, ProductCard, ProductGrid, Title } from "@/components";
import { requireAuth } from "@/lib/auth";
import { getFavoriteProducts } from "@/services/favorites.service";

export const metadata = {
  title: "Избранное",
  robots: { index: false, follow: true },
};

export default async function FavoritesPage() {
  const { supabase, user } = await requireAuth();

  const products = await getFavoriteProducts(supabase, user.id);

  return (
    <>
      <MobileHeader title="Избранное" />
      <MainContainer>
        <Title className="hidden md:block mb-6">Избранное</Title>

        {products.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="mb-4">
              <Heart className="size-6 mx-auto" />
            </p>
            <p className="text-lg font-medium text-gray-600">Здесь пока пусто</p>
            <p className="text-sm mt-1 mb-6">Добавляйте товары в избранное, нажимая на сердечко</p>
            <Link href="/" className="text-green-700 hover:underline text-sm">
              Перейти в каталог
            </Link>
          </div>
        ) : (
          <ProductGrid>
            {products.map((p, i) => (
              <ProductCard key={p.id} product={p} preload={i === 0} />
            ))}
          </ProductGrid>
        )}
      </MainContainer>
    </>
  );
}
