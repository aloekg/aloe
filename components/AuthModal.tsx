"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { safeNextPath } from "@/lib/safe-redirect";
import { useAuthModal } from "@/store/auth-modal";
import { useFavorites } from "@/store/favorites";
import { useToast } from "@/store/toast";
import Sheet from "./Sheet";
import Skeleton from "./Skeleton";

const AuthForm = dynamic(() => import("@/app/auth/AuthForm"), {
  loading: () => (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-28 mx-auto" />
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  ),
});

export default function AuthModal() {
  const open = useAuthModal((s) => s.open);

  usePendingFavorite();

  if (!open) return null;
  return <AuthSheet />;
}

// Outside the sheet, which closes before favorites load; adding before `initialized` would be overwritten by setUser.
function usePendingFavorite() {
  const pendingFavoriteId = useAuthModal((s) => s.pendingFavoriteId);
  const clearPending = useAuthModal((s) => s.clearPending);
  const userId = useFavorites((s) => s.userId);
  const initialized = useFavorites((s) => s.initialized);
  const ids = useFavorites((s) => s.ids);
  const add = useFavorites((s) => s.add);
  const show = useToast((s) => s.show);

  useEffect(() => {
    if (pendingFavoriteId == null || !userId || !initialized) return;
    clearPending();
    // `add` does not deduplicate.
    if (ids.includes(pendingFavoriteId)) return;
    add(pendingFavoriteId);
    show("Добавлено в избранное", "success");
  }, [pendingFavoriteId, userId, initialized, ids, add, show, clearPending]);
}

function AuthSheet() {
  const close = useAuthModal((s) => s.close);
  const authenticated = useAuthModal((s) => s.authenticated);
  const pendingFavoriteId = useAuthModal((s) => s.pendingFavoriteId);
  const [signedIn, setSignedIn] = useState(false);
  const [next] = useState(() =>
    typeof window === "undefined" ? "/" : safeNextPath(window.location.pathname + window.location.search),
  );

  return (
    <Sheet
      // Two closers: signing in must not drop the pending favourite.
      onClose={signedIn ? authenticated : close}
      requestClose={signedIn}
      label="Вход в аккаунт"
    >
      <div className="w-full max-w-sm mx-auto px-4 pb-6 md:px-6">
        <AuthForm
          next={next}
          titleAs="h2"
          installHint
          onAuthenticated={() => setSignedIn(true)}
          banner={
            pendingFavoriteId != null ? (
              <p className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                Войдите, чтобы сохранить товар в избранное.
              </p>
            ) : null
          }
        />
      </div>
    </Sheet>
  );
}
