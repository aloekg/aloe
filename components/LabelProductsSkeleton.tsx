import MainContainer from "./MainContainer";
import MobileHeader from "./MobileHeader";
import ProductGridSkeleton from "./ProductGridSkeleton";
import Skeleton from "./Skeleton";

/** The title is known before the data, so the phone's header renders for real rather than as a placeholder. */
export default function LabelProductsSkeleton({ title }: { title: string }) {
  return (
    <>
      <MobileHeader title={title} withBackButton />
      <MainContainer>
        <Skeleton className="hidden md:block h-8 w-40 mb-4" />
        <ProductGridSkeleton count={12} />
      </MainContainer>
    </>
  );
}
