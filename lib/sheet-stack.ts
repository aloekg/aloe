/**
 * Which `Sheet` is on top.
 *
 * Two sheets can be open at once — the sign-in sheet over the product quick view, when a guest taps
 * a heart — and each used to run its own focus trap and its own `Escape` listener on `document`.
 * Every Tab then had the lower trap notice "focus has left me" and pull it back, the upper one pull
 * it back again, and the customer could never reach the email field; one `Escape` closed both, and
 * the quick view's `router.back()` with it. So sheets register here in opening order, and only the
 * topmost one traps focus and answers `Escape`; the one beneath is `inert` until it is on top again.
 *
 * Module-level rather than context: the two sheets are mounted in unrelated subtrees (the root
 * layout and a parallel route), so there is no common ancestor to hold a provider.
 */
const stack: string[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function pushSheet(id: string) {
  if (!stack.includes(id)) stack.push(id);
  notify();
}

export function popSheet(id: string) {
  const i = stack.indexOf(id);
  if (i !== -1) stack.splice(i, 1);
  notify();
}

export function isTopSheet(id: string): boolean {
  return stack[stack.length - 1] === id;
}

export function subscribeSheetStack(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
