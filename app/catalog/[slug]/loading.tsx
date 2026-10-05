import { MainContainer, ProductGridSkeleton, Skeleton } from "@/components";

export default function Loading() {
  return (
    <>
      {/* Mirrors CategoryBrowser: one row at every width, the two triggers leading the pills. */}
      <div className="sticky top-18 md:top-41.5 z-10 bg-white">
        <div className="container mx-auto px-4 py-2">
          <div className="flex items-center gap-2 flex-nowrap overflow-hidden">
            <Skeleton className="size-9 rounded-full shrink-0" />
            <Skeleton className="size-9 rounded-full shrink-0" />
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
