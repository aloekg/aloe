import type { PostgrestError } from "@supabase/supabase-js";

// Infer from the whole response: a { data: T | null } parameter collapses T to never on the union.
type Res = { data: unknown; error: PostgrestError | null };
type Data<R extends Res> = NonNullable<R["data"]>;

// Use strict wherever the result decides notFound(): soft would turn a transient error into a cached 404.
export function soft<R extends Res>(label: string, res: R, fallback: Data<R>): Data<R> {
  if (res.error) console.error(`[${label}] ${res.error.message}`);
  return (res.data ?? fallback) as Data<R>;
}

export function strict<R extends Res>(label: string, res: R): Data<R> {
  if (res.error) throw new Error(`[${label}] ${res.error.message}`);
  if (res.data == null) throw new Error(`[${label}] returned no data`);
  return res.data as Data<R>;
}

// Throws on every error, PGRST116 included; call sites must use .maybeSingle().
export function maybe<R extends Res>(label: string, res: R): Data<R> | null {
  if (res.error) throw new Error(`[${label}] ${res.error.message}`);
  return (res.data ?? null) as Data<R> | null;
}

// PostgREST's per-request ceiling: a larger .range() silently returns 1000 rows.
export const PAGE_ROWS = 1000;

// Throws rather than returning a partial list: callers act on a row's absence.
export async function loadAllPages<T>(
  label: string,
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await fetchPage(from, from + PAGE_ROWS - 1);
    if (error) throw new Error(`[${label}] ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_ROWS) return rows;
  }
}
