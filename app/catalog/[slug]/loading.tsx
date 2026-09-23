import { MainContainer, ProductGridSkeleton, Skeleton } from "@/components";

export default function Loading() {
  return (
    <>
      {/* Mirrors CategoryBrowser's filter bar, which sits above the sticky pills and scrolls away
          with the page: one button on a phone, the controls themselves from md up. */}
      <div className="container mx-auto px-4 py-2">
        <Skeleton className="h-9 w-28 rounded-lg md:hidden" />
        <div className="hidden md:flex items-center gap-4">
          <Skeleton className="h-9 w-44 rounded-lg" />
          <Skeleton className="h-9 w-56 rounded-lg" />
        </div>
      </div>
      <div className="sticky top-15 md:top-41.5 z-10 bg-white">
        <div className="container mx-auto px-4 flex gap-2 py-2 flex-wrap">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
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
