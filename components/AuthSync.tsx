"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";
import { useCart } from "@/store/cart";
import { useFavorites } from "@/store/favorites";

export default function AuthSync() {
  const setCartUser = useCart((s) => s.setUser);
  const setFavoritesUser = useFavorites((s) => s.setUser);

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setCartUser(session.user.id);
        setFavoritesUser(session.user.id);
        return;
      }

      // Settle favourites for guests too, or `initialized` never flips and FavoriteButton stays disabled.
      setFavoritesUser(null);

      // Only a real sign-out clears the cart: INITIAL_SESSION also arrives with a null session.
      if (event === "SIGNED_OUT") setCartUser(null);
    });

    return () => subscription.unsubscribe();
  }, [setCartUser, setFavoritesUser]);

  return null;
}
