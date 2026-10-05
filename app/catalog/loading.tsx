import HeaderSearchInput from "@/components/header/HeaderSearchInput";
import MainContainer from "@/components/MainContainer";
import MobileHeader from "@/components/MobileHeader";
import Skeleton from "@/components/Skeleton";
import Title from "@/components/Title";
import { CATALOG_GRID } from "./grid";

// Mirrors page.tsx: the same header with the search, the first row of three, then sections.
export default function Loading() {
  return (
    <>
      <MobileHeader>
        <HeaderSearchInput />
      </MobileHeader>
      <MainContainer>
        <Title className="sr-only md:not-sr-only md:mb-4">Каталог товаров</Title>
        <div className="space-y-5 md:space-y-8">
          <div className={CATALOG_GRID}>
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i}>
              <Skeleton className="h-6 md:h-7 w-40 mb-2 md:mb-3" />
              <div className={CATALOG_GRID}>
                {Array.from({ length: 6 }, (_, j) => (
                  <Skeleton key={j} className="aspect-square rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </MainContainer>
    </>
  );
}
