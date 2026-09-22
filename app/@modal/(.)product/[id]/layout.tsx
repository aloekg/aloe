import ProductModal from "@/components/ProductModal";

/**
 * The sheet shell lives here rather than in each of `page`/`loading`/`error`, because those three
 * swap places inside a Suspense/error boundary: wrapping each one would unmount and remount the
 * shell every time, replaying its open animation when the product data lands. A layout stays
 * mounted across that swap, so the sheet slides in once and the skeleton is replaced inside it.
 */
export default function ProductModalLayout({ children }: { children: React.ReactNode }) {
  return <ProductModal>{children}</ProductModal>;
}
