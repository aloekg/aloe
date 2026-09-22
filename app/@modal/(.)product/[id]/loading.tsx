import Skeleton from "@/components/Skeleton";

/**
 * The highest-frequency interaction in the app had no feedback at all: clicking a card left the
 * page frozen until the fetch resolved. The shell is the layout's, so this skeleton appears inside a
 * sheet that has already slid in.
 */
export default function Loading() {
  return (
    <div className="grid sm:grid-cols-2 gap-6 px-4 pb-4 md:px-6 md:pb-6">
      <Skeleton className="aspect-square rounded-xl" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-8 w-32 mt-2" />
        <Skeleton className="h-11 w-full mt-2 rounded-lg" />
        <Skeleton className="h-4 w-full mt-4" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
