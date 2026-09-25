import ProductModal from "@/components/ProductModal";

// The shell lives here, not in page/loading/error: wrapping those would remount it and replay the open animation.
export default function ProductModalLayout({ children }: { children: React.ReactNode }) {
  return <ProductModal>{children}</ProductModal>;
}
