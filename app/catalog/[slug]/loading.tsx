import { MainContainer, ProductGridSkeleton, Skeleton } from "@/components";

export default function Loading() {
  return (
    <>
      {/* Mirrors CategoryBrowser: from md the filter row sits above the sticky pills; on a phone
          there is no row at all, only the two triggers at the head of the pill row below. */}
      <div className="hidden md:flex container mx-auto px-4 py-2 items-center gap-4">
        <Skeleton className="h-9 w-44 rounded-lg" />
        <Skeleton className="h-9 w-56 rounded-lg" />
      </div>
      <div className="sticky top-15 md:top-41.5 z-10 bg-white">
        <div className="container mx-auto px-4 flex items-center gap-2 py-2">
          <Skeleton className="size-9 rounded-full shrink-0 md:hidden" />
          <Skeleton className="size-9 rounded-full shrink-0 md:hidden" />
          {/* One row on a phone, wrapping from md — the same rule SubcategoryFilter follows, so the
              skeleton does not reserve a height the real bar will not use. */}
          <div className="flex min-w-0 flex-1 gap-2 flex-nowrap overflow-hidden md:flex-wrap">
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
