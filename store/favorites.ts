import { create } from "zustand";
import { persist } from "zustand/middleware";
import { addFavorite, loadFavoriteIds, removeFavorite } from "@/services/favorites.service";

type FavoritesStore = {
  ids: number[];
  userId: string | null;
  initialized: boolean;
  add: (id: number) => void;
  remove: (id: number) => void;
  setUser: (userId: string | null) => Promise<void>;
};

async function getSupabase() {
  const { createClient } = await import("@/lib/supabase-browser");
  return createClient();
}

function sync(run: (supabase: Awaited<ReturnType<typeof getSupabase>>) => Promise<unknown>) {
  void getSupabase()
    .then(run)
    .catch((e) => console.error("[favorites] sync failed:", e));
}

// userId is persisted with ids so another account signing in on this browser never sees them.
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

        // A failed load leaves initialized false, which is what lets the next auth event retry.
        if (get().userId === userId && get().initialized) return;

        set(get().userId === userId ? { userId } : { userId, ids: [] });

        try {
          const supabase = await getSupabase();
          set({ ids: await loadFavoriteIds(supabase, userId), initialized: true });
        } catch (e) {
          // Keep the persisted ids: settling on [] would un-heart everything.
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
