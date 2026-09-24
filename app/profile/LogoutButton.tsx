"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import { createClient } from "@/lib/supabase-browser";
import { useCart } from "@/store/cart";
import { useFavorites } from "@/store/favorites";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();
  const clearCart = useCart((s) => s.clear);
  const setFavUser = useFavorites((s) => s.setUser);

  async function signOut() {
    await supabase.auth.signOut();
    clearCart();
    setFavUser(null);
    router.push("/");
    router.refresh();
  }

  return (
    <Button
      onClick={signOut}
      className="flex items-center gap-2 px-4 py-2 text-sm text-red-700 border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
    >
      <LogOut className="size-4" aria-hidden />
      {/* sr-only, not hidden: display:none takes the text out of the accessibility tree too, and
          on a phone the button was an unnamed icon. */}
      <span className="sr-only md:not-sr-only">Выйти из аккаунта</span>
    </Button>
  );
}
