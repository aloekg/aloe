import { create } from "zustand";

type ToastType = "success" | "error" | "info";

type Toast = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastStore = {
  toasts: Toast[];
  show: (message: string, type?: ToastType) => void;
  remove: (id: string) => void;
  /** Hold a toast open while the pointer or focus is on it — WCAG 2.2.1 for a timed message. */
  pause: (id: string) => void;
  /** Let it go again, with at least RESUME_GRACE_MS left so it does not vanish under the cursor. */
  resume: (id: string) => void;
};

const TOAST_MS = 3500;
const RESUME_GRACE_MS = 1000;

/** Each toast's dismiss timer and when it is due, so a pause can hand back the remainder. */
const timers = new Map<string, { handle: ReturnType<typeof setTimeout>; dueAt: number }>();
const remaining = new Map<string, number>();

export const useToast = create<ToastStore>((set, get) => {
  const dismiss = (id: string) => {
    timers.delete(id);
    remaining.delete(id);
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  };

  const arm = (id: string, ms: number) => {
    timers.set(id, { handle: setTimeout(() => dismiss(id), ms), dueAt: Date.now() + ms });
  };

  return {
    toasts: [],

    show: (message, type = "info") => {
      const id = Math.random().toString(36).slice(2);
      set((state) => ({
        toasts: [...state.toasts.slice(-2), { id, message, type }],
      }));
      arm(id, TOAST_MS);
    },

    remove: (id) => {
      const timer = timers.get(id);
      if (timer) clearTimeout(timer.handle);
      dismiss(id);
    },

    pause: (id) => {
      const timer = timers.get(id);
      if (!timer) return;
      clearTimeout(timer.handle);
      timers.delete(id);
      remaining.set(id, Math.max(0, timer.dueAt - Date.now()));
    },

    resume: (id) => {
      if (timers.has(id) || !get().toasts.some((t) => t.id === id)) return;
      const left = remaining.get(id) ?? TOAST_MS;
      remaining.delete(id);
      arm(id, Math.max(left, RESUME_GRACE_MS));
    },
  };
});
