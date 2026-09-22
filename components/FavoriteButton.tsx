"use client";

import { Heart } from "lucide-react";
import { useAuthModal } from "@/store/auth-modal";
import { useFavorites } from "@/store/favorites";
import { useToast } from "@/store/toast";
import Button from "./Button";

export default function FavoriteButton({ productId }: { productId: number }) {
  const isFav = useFavorites((s) => s.ids.includes(productId));
  const userId = useFavorites((s) => s.userId);
  const initialized = useFavorites((s) => s.initialized);
  const add = useFavorites((s) => s.add);
  const remove = useFavorites((s) => s.remove);
  const show = useToast((s) => s.show);
  const openAuthModal = useAuthModal((s) => s.openModal);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    // Until the first auth event lands, `userId` is null for signed-in users too — sending them
    // to /auth here was a false negative that happened on every fast click after page load.
    if (!initialized) return;

    if (!userId) {
      // The modal says why it opened and presses this heart once the session lands, so there is no
      // toast here: a card in a grid can be one tap from a sign-in without losing the customer's
      // place in the catalogue.
      openAuthModal(productId);
      return;
    }

    if (isFav) {
      remove(productId);
      show("Удалено из избранного", "info");
    } else {
      add(productId);
      show("Добавлено в избранное", "success");
    }
  }

  return (
    <Button
      onClick={toggle}
      title={isFav ? "Убрать из избранного" : "В избранное"}
      aria-label={isFav ? "Убрать из избранного" : "Добавить в избранное"}
      aria-pressed={isFav}
      disabled={!initialized}
      className={`absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full transition-colors z-9
        ${isFav ? "md:bg-red-50 text-red-500 md:hover:bg-red-100" : "md:bg-white/80 text-gray-500 hover:text-red-500 md:hover:bg-white"}`}
    >
      <Heart className="size-6 md:size-4" fill={isFav ? "currentColor" : "none"} />
    </Button>
  );
}
