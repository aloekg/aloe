import { create } from "zustand";

type AuthModalStore = {
  open: boolean;
  pendingFavoriteId: number | null;
  openModal: (pendingFavoriteId?: number) => void;
  close: () => void;
  authenticated: () => void;
  clearPending: () => void;
};

export const useAuthModal = create<AuthModalStore>((set) => ({
  open: false,
  pendingFavoriteId: null,
  openModal: (pendingFavoriteId) => set({ open: true, pendingFavoriteId: pendingFavoriteId ?? null }),
  close: () => set({ open: false, pendingFavoriteId: null }),
  authenticated: () => set({ open: false }),
  clearPending: () => set({ pendingFavoriteId: null }),
}));
