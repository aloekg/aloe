"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { safeNextPath } from "@/lib/safe-redirect";
import { useAuthModal } from "@/store/auth-modal";
import { useFavorites } from "@/store/favorites";
import { useToast } from "@/store/toast";
import Sheet from "./Sheet";
import Skeleton from "./Skeleton";

/**
 * Lazy because this component is mounted in the root layout, on every page, while the form behind
 * it — password rules, validation, the Google icon — is only ever needed by a guest who taps a
 * heart. The placeholder is roughly the height of the sign-in form so the sheet does not resize
 * under the customer once the chunk arrives.
 */
const AuthForm = dynamic(() => import("@/app/auth/AuthForm"), {
  loading: () => (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-28 mx-auto" />
      <Skeleton className="h-80 w-full rounded-xl" />
    </div>
  ),
});

/**
 * Signing in without leaving the page. Mounted once in the root layout, because the trigger is
 * `FavoriteButton`, which renders on every card in a grid — a modal per card would be dozens of
 * identical dialogs waiting to be opened.
 */
export default function AuthModal() {
  const open = useAuthModal((s) => s.open);

  usePendingFavorite();

  if (!open) return null;
  return <AuthSheet />;
}

/**
 * Presses the heart the guest pressed before signing in. It can only run once `favorites` has
 * loaded the account's list: adding before that would be written into a store the following
 * `setUser` load is about to replace.
 *
 * It lives outside the sheet because the sheet closes the moment the session lands, while the
 * favourites load is still in flight.
 */
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
    // Already there — the same product favourited on another device, say. `add` does not
    // deduplicate, and a second row would show the heart twice in the store's ids.
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
  /**
   * Google sign-in leaves the site and comes back, so it has to be told where "back" is; the page
   * form defaults to "/" instead, which is right for a visit that started at /auth.
   */
  const [next] = useState(() =>
    typeof window === "undefined" ? "/" : safeNextPath(window.location.pathname + window.location.search),
  );

  return (
    <Sheet
      // Signing in dismisses the sheet the same way a tap on the backdrop does, but the pending
      // favourite has to survive it — hence two different closers.
      onClose={signedIn ? authenticated : close}
      requestClose={signedIn}
      label="Вход в аккаунт"
    >
      {/* No `fullHeight`: unlike the quick view, this sheet has nothing to wait for — the form is
          rendered from local state — so it can size itself to the form and stop where it ends.
          The width is the product sheet's, but the form itself stays at reading width: input
          fields spanning 768px are neither usable nor pretty. */}
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
