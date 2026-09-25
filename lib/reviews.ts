import type { OrderItem } from "@/types";

// Keep out of "use server" files: every export there becomes a public endpoint.

export const REVIEW_STATUS = {
  pending: { label: "На модерации", cls: "bg-yellow-100 text-yellow-700" },
  approved: { label: "Опубликован", cls: "bg-green-100 text-green-700" },
  rejected: { label: "Отклонён", cls: "bg-red-100 text-red-700" },
} as const;

export type ReviewStatus = keyof typeof REVIEW_STATUS;

export const DEFAULT_REVIEW_TAB = "pending";

export type ReviewTab = ReviewStatus | "all";

// Single source for both the tab highlight and the query; an absent param is the normal case.
export function reviewTabFromParam(value: string | null | undefined): ReviewTab {
  if (value === "all") return "all";
  return value && value in REVIEW_STATUS ? (value as ReviewStatus) : DEFAULT_REVIEW_TAB;
}

export function reviewTabFilter(tab: ReviewTab): ReviewStatus | undefined {
  return tab === "all" ? undefined : tab;
}

// Approved reviews are final; rejected stays editable because unique (user_id, product_id) forbids a new one.
export function canEditReview(status: string | null | undefined): boolean {
  return status === "pending" || status === "rejected";
}

export const MIN_RATING = 1;
export const MAX_RATING = 5;
export const MAX_REVIEW_BODY = 2000;

// Checked before the query: Postgres errors (500) on a malformed uuid instead of returning empty.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isReviewToken(value: string | null | undefined): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

const REVIEWABLE_ORDER_STATUSES = new Set(["delivered"]);

export function orderCanBeReviewed(status: string | null | undefined): boolean {
  return REVIEWABLE_ORDER_STATUSES.has(status ?? "");
}

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

export function normalizeReviewBody(body: string | null | undefined): string | null {
  const trimmed = (body ?? "").trim();
  return trimmed ? trimmed.slice(0, MAX_REVIEW_BODY) : null;
}

// alreadyReviewed spans all orders: a repeat purchase earns an edit, not a second review.
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

export function averageRating(sum: number | null | undefined, count: number | null | undefined): number | null {
  if (!count || count <= 0) return null;
  return Math.round(((sum ?? 0) / count) * 10) / 10;
}

export function starFill(average: number, star: number): "full" | "half" | "empty" {
  const diff = average - star + 1;
  if (diff >= 0.75) return "full";
  if (diff >= 0.25) return "half";
  return "empty";
}

export function reviewPlural(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "отзывов";
  const mod10 = n % 10;
  if (mod10 === 1) return "отзыв";
  if (mod10 >= 2 && mod10 <= 4) return "отзыва";
  return "отзывов";
}

export const MAX_AUTHOR_NAME = 60;

// Shortened before storing, not rendering: anon can read what an approved review row holds.
export function displayAuthorName(fullName: string | null | undefined): string | null {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const [first, ...rest] = parts;
  const surname = rest.at(-1);
  const name = surname ? `${first} ${[...surname][0].toUpperCase()}.` : first;
  return name.slice(0, MAX_AUTHOR_NAME);
}

export function authorInitial(name: string | null | undefined): string {
  const first = [...(name ?? "").trim()][0];
  return first ? first.toUpperCase() : "—";
}

// All -700 weights so white text clears AA.
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
