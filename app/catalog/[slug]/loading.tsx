import { MainContainer, ProductGridSkeleton, Skeleton } from "@/components";

export default function Loading() {
  return (
    <>
      {/* Mirrors CategoryBrowser: filter row from md; on a phone the triggers lead the pill row. */}
      <div className="hidden md:flex container mx-auto px-4 py-2 items-center gap-4">
        <Skeleton className="h-9 w-44 rounded-lg" />
        <Skeleton className="h-9 w-56 rounded-lg" />
      </div>
      <div className="sticky top-15 md:top-41.5 z-10 bg-white">
        <div className="container mx-auto px-4 py-2">
          {/* One row on a phone, wrapping from md, like SubcategoryFilter. */}
          <div className="flex items-center gap-2 flex-nowrap overflow-hidden md:flex-wrap">
            <Skeleton className="size-9 rounded-full shrink-0 md:hidden" />
            <Skeleton className="size-9 rounded-full shrink-0 md:hidden" />
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-full shrink-0" />
            ))}
          </div>
        </div>
      </div>
      <MainContainer>
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="mb-8">
            <Skeleton className="h-6 w-48 mb-4" />
            <ProductGridSkeleton count={8} />
          </div>
        ))}
      </MainContainer>
    </>
  );
}
