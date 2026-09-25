// Only the topmost sheet may trap focus and answer Escape; two traps fight and lock the user out.
// Module-level, not context: the sheets mount in unrelated subtrees (root layout and a parallel route).
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
