import { Heart } from "lucide-react";
import Link from "next/link";
import Container from "../Container";
import DeliveryModal from "../DeliveryModal";
import AuthButton from "./AuthButton";
import CartIcon from "./CartIcon";
import HeaderSearchInput from "./HeaderSearchInput";
import Logo from "./Logo";

/**
 * `logoOnly` is for the home page's phone header: everything else in this bar is `hidden` below
 * `md`, and hidden is not absent — the second copy of the header still mounted a search field, the
 * delivery dialog, the cart icon and an AuthButton that asked GoTrue who was signed in, all for a
 * bar that shows the logo.
 */
export default function Header({ className, logoOnly = false }: { className?: string; logoOnly?: boolean }) {
  return (
    <header className={`${className ?? "hidden md:block"} h-16 bg-green-50 sticky top-0 z-50`}>
      <Container className="h-full flex items-center gap-2 md:gap-4">
        {/* Logo */}
        <Logo className="md:w-40 lg:w-56" withIcon />

        {!logoOnly && (
          <>
            <HeaderSearchInput className="hidden md:flex" />

            <div className="hidden md:flex items-center gap-2 text-gray-600">
              <DeliveryModal />
              <Link
                href="/favorites"
                className="p-2 text-gray-500 hover:text-red-500 transition-colors"
                title="Избранное"
              >
                <Heart className="size-5" />
              </Link>
              <CartIcon />
              <AuthButton />
            </div>
          </>
        )}
      </Container>
    </header>
  );
}
