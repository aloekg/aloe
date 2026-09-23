import type { OrderItem } from "@/types";

/**
 * Review rules, kept free of the database so `tests/reviews.test.ts` can exercise them — the same
 * reasoning as lib/order-pricing.ts. A server action may only export server actions, so validation
 * that both the form and the action have to agree on cannot live in the action file.
 */

export const REVIEW_STATUS = {
  pending: { label: "На модерации", cls: "bg-yellow-100 text-yellow-700" },
  approved: { label: "Опубликован", cls: "bg-green-100 text-green-700" },
  rejected: { label: "Отклонён", cls: "bg-red-100 text-red-700" },
} as const;

export type ReviewStatus = keyof typeof REVIEW_STATUS;

/** The moderation queue's default tab: the only one that ever has work in it. */
export const DEFAULT_REVIEW_TAB = "pending";

export type ReviewTab = ReviewStatus | "all";

/**
 * Which tab `?status=` selects, for both the highlight and the query — **one** source of truth.
 *
 * Two of them disagreed: the tabs defaulted to `pending` while the query defaulted to no filter at
 * all, so "На модерации" listed every review. An absent parameter is the normal case rather than an
 * edge one, because `useAdminListNav` drops a value equal to its default — choosing that very tab
 * removes it from the URL.
 *
 * An unrecognised value falls back rather than being passed through, which would have filtered on
 * nonsense and shown an empty list with no tab lit.
 */
export function reviewTabFromParam(value: string | null | undefined): ReviewTab {
  if (value === "all") return "all";
  return value && value in REVIEW_STATUS ? (value as ReviewStatus) : DEFAULT_REVIEW_TAB;
}

/** The status to filter the query by, or undefined for "all". */
export function reviewTabFilter(tab: ReviewTab): ReviewStatus | undefined {
  return tab === "all" ? undefined : tab;
}

export const MIN_RATING = 1;
export const MAX_RATING = 5;
export const MAX_REVIEW_BODY = 2000;

/**
 * Whether a path segment can possibly be a review token.
 *
 * `orders.review_token` is a uuid, and Postgres rejects a malformed one with an error rather than
 * an empty result — so `/review/не-uuid` surfaced as a 500 where it should be a 404. Checked here,
 * before the query, so the shape of the URL never reaches the database.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isReviewToken(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

/** The statuses whose orders may be reviewed — the product has to have arrived first. */
const REVIEWABLE_ORDER_STATUSES = new Set(["delivered"]);

export function orderCanBeReviewed(status: string | null | undefined): boolean {
  return REVIEWABLE_ORDER_STATUSES.has(status ?? "");
}

/**
 * First failing rule as the message to show, or null. One function for the form and the action, so
 * the button a customer sees disabled and the submission the server refuses cannot disagree.
 */
export function validateReview(rating: unknown, body: unknown): string | null {
  if (!Number.isInteger(rating) || (rating as number) < MIN_RATING || (rating as number) > MAX_RATING) {
    return "Поставьте оценку от 1 до 5";
  }
  if (body != null && typeof body !== "string") return "Некорректный текст отзыва";
  if (typeof body === "string" && body.trim().length > MAX_REVIEW_BODY) {
    return `Отзыв длиннее ${MAX_REVIEW_BODY} символов`;
  }
  return null;
}

/** Empty text is stored as null rather than "", so "a rating with no words" is one state, not two. */
export function normalizeReviewBody(body: string | null | undefined): string | null {
  const trimmed = (body ?? "").trim();
  return trimmed ? trimmed.slice(0, MAX_REVIEW_BODY) : null;
}

/**
 * Which of an order's lines the customer may still review.
 *
 * Deduplicated by product id: `orders.items` cannot repeat a product (checkout merges duplicate
 * lines), but an order edited in the admin is typed by hand, and offering the same product twice
 * would produce a unique-constraint failure instead of a message.
 *
 * `alreadyReviewed` is what this customer has reviewed **anywhere**, not just in this order — a
 * repeat purchase of the same product earns an edit, not a second review. See the 20260923200000
 * migration.
 */
export function reviewableItems(items: readonly OrderItem[], alreadyReviewed: readonly number[]): OrderItem[] {
  const done = new Set(alreadyReviewed);
  const seen = new Set<number>();
  const out: OrderItem[] = [];
  for (const item of items) {
    if (done.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/**
 * The average to render, from the denormalised sum and count. Sum-and-count rather than a stored
 * average because an average cannot be updated incrementally without drift; the division happens
 * once, here.
 */
export function averageRating(sum: number | null | undefined, count: number | null | undefined): number | null {
  if (!count || count <= 0) return null;
  return Math.round(((sum ?? 0) / count) * 10) / 10;
}

/** How many of the five stars are filled, half-steps included, for a rounded display. */
export function starFill(average: number, star: number): "full" | "half" | "empty" {
  const diff = average - star + 1;
  if (diff >= 0.75) return "full";
  if (diff >= 0.25) return "half";
  return "empty";
}

/** ru-RU plurals: 1 отзыв, 2 отзыва, 5 отзывов — and 11..14 take the last form. */
export function reviewPlural(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "отзывов";
  const mod10 = n % 10;
  if (mod10 === 1) return "отзыв";
  if (mod10 >= 2 && mod10 <= 4) return "отзыва";
  return "отзывов";
}

export const MAX_AUTHOR_NAME = 60;

/**
 * The name to publish, from the one on the customer's profile: first name plus the initial of the
 * surname. "Айгерим Садыкова" becomes "Айгерим С."
 *
 * Shortened before it is stored, not before it is rendered, because `anon` may read every column of
 * an approved review — whatever the row holds is public. A full name against a purchase is more
 * than this shop ever asked permission to publish, and a first name is enough to make a review read
 * as written by a person.
 *
 * Returns null when there is nothing usable, and the storefront says "Покупатель".
 */
export function displayAuthorName(fullName: string | null | undefined): string | null {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const [first, ...rest] = parts;
  const surname = rest.at(-1);
  const name = surname ? `${first} ${[...surname][0].toUpperCase()}.` : first;
  return name.slice(0, MAX_AUTHOR_NAME);
}

/** The letter in the avatar circle. "—" rather than an empty circle when there is no name. */
export function authorInitial(name: string | null | undefined): string {
  const first = [...(name ?? "").trim()][0];
  return first ? first.toUpperCase() : "—";
}

/**
 * Which of the avatar tints a name gets, chosen deterministically so the same person keeps the same
 * colour across reviews and across renders. All six are `-700` weights carrying white text, which
 * clears AA at this size — see ACCESSIBILITY.md.
 */
const AVATAR_TONES = [
  "bg-green-700",
  "bg-teal-700",
  "bg-sky-700",
  "bg-indigo-700",
  "bg-rose-700",
  "bg-amber-700",
] as const;

export function avatarTone(seed: string | null | undefined): string {
  const key = seed ?? "";
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}
