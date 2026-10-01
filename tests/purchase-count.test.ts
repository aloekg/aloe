import { describe, expect, it } from "vitest";
import { countsAsPurchase, ORDER_STATUS, purchaseCountDelta } from "@/lib/constants";

describe("countsAsPurchase", () => {
  it("counts an order a human has confirmed, and everything after it", () => {
    expect(countsAsPurchase("confirmed")).toBe(true);
    expect(countsAsPurchase("processing")).toBe(true);
    expect(countsAsPurchase("delivered")).toBe(true);
  });

  it("does not count a placed order or a cancelled one", () => {
    // There is no payment gate: `new` is an intent, not a sale.
    expect(countsAsPurchase("new")).toBe(false);
    expect(countsAsPurchase("cancelled")).toBe(false);
  });

  it("treats a missing status as not counted rather than throwing", () => {
    expect(countsAsPurchase(null)).toBe(false);
    expect(countsAsPurchase(undefined)).toBe(false);
    expect(countsAsPurchase("")).toBe(false);
  });

  it("classifies every status the schema allows", () => {
    // The CHECK on orders.status and ORDER_STATUS are the same five; a sixth added to one and not
    // the other would silently fall outside the set.
    for (const status of Object.keys(ORDER_STATUS)) {
      expect(typeof countsAsPurchase(status)).toBe("boolean");
    }
  });
});

describe("purchaseCountDelta", () => {
  it("counts the order when it is confirmed", () => {
    expect(purchaseCountDelta("new", "confirmed")).toBe(1);
  });

  it("counts it when it jumps straight to delivered", () => {
    expect(purchaseCountDelta("new", "delivered")).toBe(1);
  });

  it("takes it back when a counted order is cancelled", () => {
    expect(purchaseCountDelta("confirmed", "cancelled")).toBe(-1);
    expect(purchaseCountDelta("delivered", "cancelled")).toBe(-1);
  });

  it("takes it back when a counted order is reopened as new", () => {
    expect(purchaseCountDelta("delivered", "new")).toBe(-1);
  });

  it("counts a revived order once more", () => {
    expect(purchaseCountDelta("cancelled", "confirmed")).toBe(1);
  });

  it("does nothing while moving inside the counted set", () => {
    expect(purchaseCountDelta("confirmed", "processing")).toBe(0);
    expect(purchaseCountDelta("processing", "delivered")).toBe(0);
  });

  it("does nothing while moving inside the uncounted set", () => {
    expect(purchaseCountDelta("new", "cancelled")).toBe(0);
    expect(purchaseCountDelta("cancelled", "new")).toBe(0);
  });

  it("is idempotent — the same status twice never double-counts", () => {
    for (const status of Object.keys(ORDER_STATUS)) {
      expect(purchaseCountDelta(status, status)).toBe(0);
    }
  });

  it("never counts an order twice across a round trip", () => {
    // confirm → cancel → confirm must leave the counter where one confirmation puts it.
    const trip: number[] = [
      purchaseCountDelta("new", "confirmed"),
      purchaseCountDelta("confirmed", "cancelled"),
      purchaseCountDelta("cancelled", "confirmed"),
    ];
    expect(trip.reduce((a, b) => a + b, 0)).toBe(1);
  });
});
