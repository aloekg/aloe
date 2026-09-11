import { create } from "zustand";
import { persist } from "zustand/middleware";
import { addFavorite, loadFavoriteIds, removeFavorite } from "@/services/favorites.service";

type FavoritesStore = {
  ids: number[];
  userId: string | null;
  /** False until the first auth event has been handled, so the UI can avoid guessing. */
  initialized: boolean;
  add: (id: number) => void;
  remove: (id: number) => void;
  setUser: (userId: string | null) => Promise<void>;
};

async function getSupabase() {
  const { createClient } = await import("@/lib/supabase-browser");
  return createClient();
}

/**
 * Mirrors the cart's fire-and-forget writes. Failures are swallowed rather than left to reject
 * unhandled offline; the next successful `setUser` load is what reconciles the two sides.
 */
function sync(run: (supabase: Awaited<ReturnType<typeof getSupabase>>) => Promise<unknown>) {
  void getSupabase()
    .then(run)
    .catch((e) => console.error("[favorites] sync failed:", e));
}

/**
 * Persisted so a returning customer's hearts are already right on first paint, instead of rendering
 * empty until `loadFavoriteIds` answers — and staying empty if it never does. `userId` rides along
 * because those ids belong to one account: without it, the next person to sign in on this browser
 * would briefly see someone else's favourites.
 *
 * Unlike the cart there is nothing to keep for a guest — FavoriteButton sends them to /auth rather
 * than storing anything — so signing out drops the lot.
 */
export const useFavorites = create<FavoritesStore>()(
  persist(
    (set, get) => ({
      ids: [],
      userId: null,
      initialized: false,

      add: (id) => {
        set((state) => ({ ids: [...state.ids, id] }));
        const { userId } = get();
        if (userId) {
          sync((sb) => addFavorite(sb, userId, id));
        }
      },

      remove: (id) => {
        set((state) => ({ ids: state.ids.filter((i) => i !== id) }));
        const { userId } = get();
        if (userId) {
          sync((sb) => removeFavorite(sb, userId, id));
        }
      },

      setUser: async (userId) => {
        if (!userId) {
          set({ userId: null, ids: [], initialized: true });
          return;
        }

        // onAuthStateChange fires for INITIAL_SESSION, SIGNED_IN, hourly TOKEN_REFRESHED and on tab
        // focus; reloading the same user's favourites on each of those is pure waste. A failed load
        // leaves `initialized` false, which is also what lets the next of those events retry.
        if (get().userId === userId && get().initialized) return;

        // Rehydrated ids are only worth showing to the account that saved them.
        set(get().userId === userId ? { userId } : { userId, ids: [] });

        try {
          const supabase = await getSupabase();
          set({ ids: await loadFavoriteIds(supabase, userId), initialized: true });
        } catch (e) {
          // Settling on an empty list would grey out every heart the customer had already set, so
          // keep showing the persisted ones and try again on the next auth event.
          console.error("[favorites] load failed:", e);
        }
      },
    }),
    {
      name: "favorites",
      partialize: (state) => ({ ids: state.ids, userId: state.userId }),
    },
  ),
);
