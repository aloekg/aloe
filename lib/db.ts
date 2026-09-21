import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Supabase responses are a discriminated union (`{data, error: null} | {data: null, error}`), so
 * these infer from the argument rather than from a `{ data: T | null }` shape — the latter
 * collapses T to `never` when the union is passed in.
 */
type Res = { data: unknown; error: PostgrestError | null };
type Data<R extends Res> = NonNullable<R["data"]>;

/**
 * A failed query used to be indistinguishable from an empty one: services destructured only
 * `{ data }`, so a database outage, an RLS denial or a malformed filter all rendered as "no
 * products" with nothing in the logs.
 *
 * Use `soft` where an empty result is something the page can legitimately render, and `strict`
 * where it is not — in particular anywhere the result decides `notFound()`, since returning empty
 * there turns a transient error into a 404 that then gets cached.
 */
export function soft<R extends Res>(label: string, res: R, fallback: Data<R>): Data<R> {
  if (res.error) console.error(`[${label}] ${res.error.message}`);
  return (res.data ?? fallback) as Data<R>;
}

export function strict<R extends Res>(label: string, res: R): Data<R> {
  if (res.error) throw new Error(`[${label}] ${res.error.message}`);
  if (res.data == null) throw new Error(`[${label}] returned no data`);
  return res.data as Data<R>;
}

/**
 * For lookups where "not found" is an ordinary outcome. Call sites must use `.maybeSingle()`, which
 * reports zero rows as `{ data: null, error: null }`.
 *
 * Deliberately throws on *every* error. The earlier version excused PGRST116 to let `.single()`
 * misses through — but `.single()` reports "more than one row" with that same code, so a duplicate
 * `brands.slug` surfaced as a 404 instead of the data-integrity problem it is.
 */
export function maybe<R extends Res>(label: string, res: R): Data<R> | null {
  if (res.error) throw new Error(`[${label}] ${res.error.message}`);
  return (res.data ?? null) as Data<R> | null;
}

/** PostgREST's ceiling per request: asking for more in one `.range()` silently returns 1000 rows. */
export const PAGE_ROWS = 1000;

/**
 * Reads a whole list through that ceiling, one `.range()` at a time.
 *
 * Throws on an error rather than returning what it has, for the same reason as `strict`: a
 * half-loaded list is indistinguishable from a short one, and every caller here draws a conclusion
 * from the absence of a row — the sitemap withdraws a product from Search Console, the analytics
 * page lists it as unsold. A partial page also ends the loop, so one failed request used to be
 * reported as "that is all there is".
 */
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
