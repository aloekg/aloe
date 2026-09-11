import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clearCart, deleteCartItem, loadCart, reconcileCartItems, upsertCartItem } from "@/services/cart.service";

type CartItem = {
  id: number;
  name: string;
  price: number;
  image_url: string;
  quantity: number;
};

type CartStore = {
  items: CartItem[];
  userId: string | null;
  add: (item: Omit<CartItem, "quantity">) => void;
  addMany: (items: CartItem[]) => void;
  remove: (id: number) => void;
  increment: (id: number) => void;
  decrement: (id: number) => void;
  clear: () => void;
  total: () => number;
  count: () => number;
  setUser: (userId: string | null) => Promise<void>;
};

async function getSupabase() {
  const { createClient } = await import("@/lib/supabase-browser");
  return createClient();
}

/**
 * Pushes a change to the server-side cart without blocking the UI on it. Failures are swallowed on
 * purpose — offline these are unhandled rejections otherwise, and the local cart is the source of
 * truth regardless: the next sign-in merges it back over whatever the database ended up holding.
 */
function sync(run: (supabase: Awaited<ReturnType<typeof getSupabase>>) => Promise<unknown>) {
  void getSupabase()
    .then(run)
    .catch((e) => console.error("[cart] sync failed:", e));
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      userId: null,

      add: (item) => {
        set((state) => {
          const exists = state.items.find((i) => i.id === item.id);
          if (exists) {
            return {
              items: state.items.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)),
            };
          }
          return { items: [...state.items, { ...item, quantity: 1 }] };
        });
        const { userId, items } = get();
        if (userId) {
          const updated = items.find((i) => i.id === item.id)!;
          sync((sb) => upsertCartItem(sb, userId, item.id, updated.quantity));
        }
      },

      /**
       * Bulk add for "repeat order". Calling add() per unit meant N state updates and N
       * upserts of the same cart row — ten units of one product was ten round trips.
       */
      addMany: (incoming) => {
        set((state) => {
          // Replace, never mutate: AddToCart selects the item *object* and zustand compares
          // selector results with Object.is, so an in-place bump left the counter showing the old
          // quantity — and retroactively altered the snapshot `persist` had already written.
          const merged = [...state.items];
          for (const item of incoming) {
            const i = merged.findIndex((x) => x.id === item.id);
            if (i >= 0) merged[i] = { ...merged[i], quantity: merged[i].quantity + item.quantity };
            else merged.push({ ...item });
          }
          return { items: merged };
        });
        const { userId, items } = get();
        if (userId) {
          const touched = items.filter((i) => incoming.some((n) => n.id === i.id));
          sync((sb) => reconcileCartItems(sb, userId, touched));
        }
      },

      remove: (id) => {
        const { userId } = get();
        set((state) => ({ items: state.items.filter((i) => i.id !== id) }));
        if (userId) {
          sync((sb) => deleteCartItem(sb, userId, id));
        }
      },

      increment: (id) => {
        set((state) => ({
          items: state.items.map((i) => (i.id === id ? { ...i, quantity: i.quantity + 1 } : i)),
        }));
        const { userId, items } = get();
        if (userId) {
          const updated = items.find((i) => i.id === id)!;
          sync((sb) => upsertCartItem(sb, userId, id, updated.quantity));
        }
      },

      decrement: (id) => {
        const prev = get().items.find((i) => i.id === id);
        set((state) => ({
          items: state.items
            .map((i) => (i.id === id ? { ...i, quantity: i.quantity - 1 } : i))
            .filter((i) => i.quantity > 0),
        }));
        const { userId } = get();
        if (userId && prev) {
          if (prev.quantity <= 1) {
            sync((sb) => deleteCartItem(sb, userId, id));
          } else {
            const updated = get().items.find((i) => i.id === id);
            if (updated) {
              sync((sb) => upsertCartItem(sb, userId, id, updated.quantity));
            }
          }
        }
      },

      clear: () => {
        const { userId } = get();
        set({ items: [] });
        if (userId) {
          sync((sb) => clearCart(sb, userId));
        }
      },

      total: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      count: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      setUser: async (userId) => {
        if (!userId) {
          set({ userId: null, items: [] });
          return;
        }

        // onAuthStateChange fires on INITIAL_SESSION, SIGNED_IN, hourly TOKEN_REFRESHED and on
        // tab focus. Re-running the merge each time cost 3-4 round trips, and two overlapping
        // calls both read get().items before either wrote, so the merge could double-apply.
        if (get().userId === userId) return;

        set({ userId });

        try {
          const supabase = await getSupabase();
          const dbItems = await loadCart(supabase, userId);

          // Local items win on conflict, DB-only items are appended
          const localItems = get().items;
          const merged: CartItem[] = [...localItems];
          for (const dbItem of dbItems) {
            if (!merged.find((i) => i.id === dbItem.id)) {
              merged.push(dbItem);
            }
          }

          set({ items: merged });

          // Reconcile local-only items back to DB
          const localOnly = localItems.filter((li) => !dbItems.find((di) => di.id === li.id));
          if (localOnly.length > 0) {
            await reconcileCartItems(supabase, userId, localOnly);
          }
        } catch (e) {
          // Drop back to signed-out so the guard above lets the next auth event retry. Leaving
          // `userId` set would mark the cart merged and never run it again for this session.
          console.error("[cart] merge failed:", e);
          set({ userId: null });
        }
      },
    }),
    {
      name: "cart",
      partialize: (state) => ({ items: state.items }),
    },
  ),
);
