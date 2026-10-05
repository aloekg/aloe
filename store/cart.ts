import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  clearCart,
  deleteCartItem,
  deleteCartItems,
  loadCart,
  reconcileCartItems,
  upsertCartItem,
} from "@/services/cart.service";

type CartItem = {
  id: number;
  name: string;
  price: number;
  image_url: string;
  quantity: number;
};

type CartStore = {
  items: CartItem[];
  // Unticked lines, not ticked ones: a newly added product is selected without anyone touching it.
  excluded: number[];
  userId: string | null;
  add: (item: Omit<CartItem, "quantity">) => void;
  addMany: (items: CartItem[]) => void;
  remove: (id: number) => void;
  // After an order: the ordered lines leave, the unticked ones stay.
  removeMany: (ids: number[]) => void;
  toggleSelected: (id: number) => void;
  setAllSelected: (selected: boolean) => void;
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

// Failures swallowed on purpose: the local cart is the source of truth and re-merges on sign-in.
function sync(run: (supabase: Awaited<ReturnType<typeof getSupabase>>) => Promise<unknown>) {
  void getSupabase()
    .then(run)
    .catch((e) => console.error("[cart] sync failed:", e));
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      excluded: [],
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
        // Adding a product again is asking for it: it goes back into the order.
        set((state) => ({ excluded: state.excluded.filter((x) => x !== item.id) }));
        const { userId, items } = get();
        if (userId) {
          const updated = items.find((i) => i.id === item.id)!;
          sync((sb) => upsertCartItem(sb, userId, item.id, updated.quantity));
        }
      },

      addMany: (incoming) => {
        set((state) => {
          // Replace, never mutate: AddToCart selects the item object and zustand compares with Object.is.
          const merged = [...state.items];
          for (const item of incoming) {
            const i = merged.findIndex((x) => x.id === item.id);
            if (i >= 0) merged[i] = { ...merged[i], quantity: merged[i].quantity + item.quantity };
            else merged.push({ ...item });
          }
          return { items: merged, excluded: state.excluded.filter((x) => !incoming.some((n) => n.id === x)) };
        });
        const { userId, items } = get();
        if (userId) {
          const touched = items.filter((i) => incoming.some((n) => n.id === i.id));
          sync((sb) => reconcileCartItems(sb, userId, touched));
        }
      },

      remove: (id) => {
        const { userId } = get();
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
          excluded: state.excluded.filter((x) => x !== id),
        }));
        if (userId) {
          sync((sb) => deleteCartItem(sb, userId, id));
        }
      },

      removeMany: (ids) => {
        const { userId } = get();
        set((state) => ({
          items: state.items.filter((i) => !ids.includes(i.id)),
          excluded: state.excluded.filter((x) => !ids.includes(x)),
        }));
        if (userId) sync((sb) => deleteCartItems(sb, userId, ids));
      },

      toggleSelected: (id) =>
        set((state) => ({
          excluded: state.excluded.includes(id) ? state.excluded.filter((x) => x !== id) : [...state.excluded, id],
        })),

      setAllSelected: (selected) => set((state) => ({ excluded: selected ? [] : state.items.map((i) => i.id) })),

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
          excluded: prev && prev.quantity <= 1 ? state.excluded.filter((x) => x !== id) : state.excluded,
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
        set({ items: [], excluded: [] });
        if (userId) {
          sync((sb) => clearCart(sb, userId));
        }
      },

      total: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      count: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      setUser: async (userId) => {
        if (!userId) {
          set({ userId: null, items: [], excluded: [] });
          return;
        }

        // onAuthStateChange refires for the same user (token refresh, focus); re-merging would double-apply.
        if (get().userId === userId) return;

        set({ userId });

        try {
          const supabase = await getSupabase();
          const dbItems = await loadCart(supabase, userId);

          const localItems = get().items;
          const merged: CartItem[] = [...localItems];
          for (const dbItem of dbItems) {
            if (!merged.find((i) => i.id === dbItem.id)) {
              merged.push(dbItem);
            }
          }

          set({ items: merged });

          const localOnly = localItems.filter((li) => !dbItems.find((di) => di.id === li.id));
          if (localOnly.length > 0) {
            await reconcileCartItems(supabase, userId, localOnly);
          }
        } catch (e) {
          // Reset so the guard above lets the next auth event retry the merge.
          console.error("[cart] merge failed:", e);
          set({ userId: null });
        }
      },
    }),
    {
      name: "cart",
      partialize: (state) => ({ items: state.items, excluded: state.excluded }),
    },
  ),
);

// Derived in the component, not in a selector: a selector returning a fresh array re-renders forever.
export function selectedItems<T extends { id: number }>(items: T[], excluded: number[]): T[] {
  return items.filter((i) => !excluded.includes(i.id));
}
