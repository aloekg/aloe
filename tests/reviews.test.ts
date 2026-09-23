import { describe, expect, it } from "vitest";
import { ORDER_STATUS } from "@/lib/constants";
import {
  authorInitial,
  avatarTone,
  averageRating,
  displayAuthorName,
  isReviewToken,
  MAX_REVIEW_BODY,
  normalizeReviewBody,
  orderCanBeReviewed,
  reviewableItems,
  reviewTabFilter,
  reviewTabFromParam,
  starFill,
  validateReview,
} from "@/lib/reviews";
import type { OrderItem } from "@/types";

const item = (id: number): OrderItem => ({ id, name: `Товар ${id}`, price: 100, quantity: 1, image_url: "" });

describe("orderCanBeReviewed", () => {
  it("only a delivered order — the product has to have arrived", () => {
    expect(orderCanBeReviewed("delivered")).toBe(true);
    for (const status of ["new", "confirmed", "processing", "cancelled"]) {
      expect(orderCanBeReviewed(status)).toBe(false);
    }
  });

  it("classifies every status the schema allows", () => {
    for (const status of Object.keys(ORDER_STATUS)) expect(typeof orderCanBeReviewed(status)).toBe("boolean");
  });

  it("treats a missing status as not reviewable", () => {
    expect(orderCanBeReviewed(null)).toBe(false);
    expect(orderCanBeReviewed(undefined)).toBe(false);
  });
});

describe("validateReview", () => {
  it("accepts a rating with no words — the stars are the point", () => {
    expect(validateReview(5, null)).toBeNull();
    expect(validateReview(1, "")).toBeNull();
  });

  it("refuses a rating outside 1..5", () => {
    for (const bad of [0, 6, -1, 2.5, NaN, Infinity, "5", null, undefined]) {
      expect(validateReview(bad, null)).not.toBeNull();
    }
  });

  it("refuses a body past the cap", () => {
    expect(validateReview(4, "a".repeat(MAX_REVIEW_BODY))).toBeNull();
    expect(validateReview(4, "a".repeat(MAX_REVIEW_BODY + 1))).not.toBeNull();
  });

  it("refuses a body that is not text", () => {
    expect(validateReview(4, 42)).not.toBeNull();
  });
});

describe("normalizeReviewBody", () => {
  it("stores blank text as null, so 'no words' is one state", () => {
    expect(normalizeReviewBody("")).toBeNull();
    expect(normalizeReviewBody("   \n ")).toBeNull();
    expect(normalizeReviewBody(null)).toBeNull();
    expect(normalizeReviewBody(undefined)).toBeNull();
  });

  it("trims and caps", () => {
    expect(normalizeReviewBody("  хорошо  ")).toBe("хорошо");
    expect(normalizeReviewBody("a".repeat(MAX_REVIEW_BODY + 50))?.length).toBe(MAX_REVIEW_BODY);
  });
});

describe("reviewableItems", () => {
  it("drops what has already been reviewed", () => {
    expect(reviewableItems([item(1), item(2), item(3)], [2]).map((i) => i.id)).toEqual([1, 3]);
  });

  it("offers a product once even if the order lists it twice", () => {
    // Checkout merges duplicate lines, but an admin edits an order by hand — and offering the same
    // product twice would surface as a unique-constraint failure instead of a message.
    expect(reviewableItems([item(1), item(1), item(2)], []).map((i) => i.id)).toEqual([1, 2]);
  });

  it("returns nothing when everything is reviewed", () => {
    expect(reviewableItems([item(1)], [1])).toEqual([]);
  });
});

describe("averageRating", () => {
  it("is null with no reviews rather than 0 — an unrated product is not a badly rated one", () => {
    expect(averageRating(0, 0)).toBeNull();
    expect(averageRating(null, null)).toBeNull();
    expect(averageRating(12, 0)).toBeNull();
  });

  it("rounds to one decimal", () => {
    expect(averageRating(9, 2)).toBe(4.5);
    expect(averageRating(10, 3)).toBe(3.3);
    expect(averageRating(5, 1)).toBe(5);
  });
});

describe("starFill", () => {
  it("fills whole stars below the average", () => {
    expect([1, 2, 3, 4, 5].map((s) => starFill(4, s))).toEqual(["full", "full", "full", "full", "empty"]);
  });

  it("halves the star the average lands inside", () => {
    expect([1, 2, 3, 4, 5].map((s) => starFill(3.5, s))).toEqual(["full", "full", "full", "half", "empty"]);
  });

  it("rounds a near-whole average up rather than showing a half", () => {
    expect(starFill(3.8, 4)).toBe("full");
    expect(starFill(3.1, 4)).toBe("empty");
  });
});

describe("isReviewToken", () => {
  it("accepts a uuid in either case", () => {
    expect(isReviewToken("f2ba1cdc-dea6-4a37-8349-0914a2466804")).toBe(true);
    expect(isReviewToken("F2BA1CDC-DEA6-4A37-8349-0914A2466804")).toBe(true);
  });

  it("rejects anything Postgres would refuse to cast", () => {
    // `/review/не-uuid` used to reach the database and come back a 500 instead of a 404.
    for (const bad of [
      "не-uuid",
      "",
      "  ",
      "123",
      "f2ba1cdc-dea6-4a37-8349",
      "'; drop table reviews; --",
      null,
      undefined,
    ]) {
      expect(isReviewToken(bad as string)).toBe(false);
    }
  });
});

describe("displayAuthorName", () => {
  it("shortens a surname to its initial — the full one would be public", () => {
    expect(displayAuthorName("Айгерим Садыкова")).toBe("Айгерим С.");
    expect(displayAuthorName("Тимур Асанов")).toBe("Тимур А.");
  });

  it("keeps a single name as it is", () => {
    expect(displayAuthorName("Айгерим")).toBe("Айгерим");
  });

  it("uses the last part when there is a patronymic", () => {
    expect(displayAuthorName("Айгерим Болотовна Садыкова")).toBe("Айгерим С.");
  });

  it("copes with stray whitespace", () => {
    expect(displayAuthorName("  Тимур   Асанов  ")).toBe("Тимур А.");
  });

  it("is null when there is nothing to show", () => {
    for (const bad of ["", "   ", null, undefined]) expect(displayAuthorName(bad)).toBeNull();
  });
});

describe("authorInitial", () => {
  it("takes the first letter, upper-cased", () => {
    expect(authorInitial("айгерим С.")).toBe("А");
  });

  it("falls back rather than rendering an empty circle", () => {
    expect(authorInitial(null)).toBe("—");
    expect(authorInitial("  ")).toBe("—");
  });
});

describe("avatarTone", () => {
  it("is stable for the same name", () => {
    expect(avatarTone("Айгерим С.")).toBe(avatarTone("Айгерим С."));
  });

  it("returns a tone even for nothing", () => {
    expect(avatarTone(null)).toMatch(/^bg-/);
  });
});

describe("reviewTabFromParam / reviewTabFilter", () => {
  it("defaults to the moderation queue when the URL says nothing", () => {
    // The normal case, not an edge one: useAdminListNav drops a value equal to its default, so
    // choosing "На модерации" removes ?status= from the URL entirely.
    for (const absent of [undefined, null, ""]) {
      expect(reviewTabFromParam(absent)).toBe("pending");
      expect(reviewTabFilter(reviewTabFromParam(absent))).toBe("pending");
    }
  });

  it("filters by the tab it highlights — the two used to disagree", () => {
    // The bug: tabs highlighted `pending` while the query filtered by nothing, so "На модерации"
    // listed all 57 reviews.
    for (const status of ["pending", "approved", "rejected"] as const) {
      expect(reviewTabFromParam(status)).toBe(status);
      expect(reviewTabFilter(reviewTabFromParam(status))).toBe(status);
    }
  });

  it("drops the filter only for «Все»", () => {
    expect(reviewTabFromParam("all")).toBe("all");
    expect(reviewTabFilter("all")).toBeUndefined();
  });

  it("falls back on nonsense instead of filtering on it", () => {
    // Filtering on an unknown value would show an empty list with no tab lit.
    for (const junk of ["bogus", "ALL", "Pending", "1", "'; --"]) {
      expect(reviewTabFromParam(junk)).toBe("pending");
    }
  });
});
