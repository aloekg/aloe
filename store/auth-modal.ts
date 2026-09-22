import { create } from "zustand";

type AuthModalStore = {
  open: boolean;
  /**
   * The product a guest was trying to favourite when the modal opened. Kept so the heart they
   * pressed lands once they are signed in, rather than making them find the card again.
   */
  pendingFavoriteId: number | null;
  openModal: (pendingFavoriteId?: number) => void;
  /** Dismissed without signing in — the pending heart goes with it. */
  close: () => void;
  /** Signed in: the modal goes away but the pending heart is still owed. */
  authenticated: () => void;
  clearPending: () => void;
};

/**
 * Deliberately not persisted, like the toast store: a half-finished sign-in is not state worth
 * restoring on the next visit.
 */
export const useAuthModal = create<AuthModalStore>((set) => ({
  open: false,
  pendingFavoriteId: null,
  openModal: (pendingFavoriteId) => set({ open: true, pendingFavoriteId: pendingFavoriteId ?? null }),
  close: () => set({ open: false, pendingFavoriteId: null }),
  authenticated: () => set({ open: false }),
  clearPending: () => set({ pendingFavoriteId: null }),
}));
