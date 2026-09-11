import { describe, expect, it } from "vitest";
import { buildQuote, MAX_QUANTITY, money, parseLines, type PricedProduct } from "@/lib/order-pricing";

/** Stands in for the database: only the published rows it is given exist. */
const lookup = (rows: PricedProduct[]) => async () => rows;

const product = (id: number, price: number | string | null, name = `Товар ${id}`): PricedProduct => ({
  id,
  name,
  price,
  image_url: `https://example.test/${id}.webp`,
});

describe("parseLines", () => {
  it("merges a product sent twice instead of rejecting the cart", () => {
    expect(
      parseLines([
        { id: 7, quantity: 2 },
        { id: 7, quantity: 3 },
      ]),
    ).toEqual([{ id: 7, quantity: 5 }]);
  });

  it("clamps a merged quantity to the cap", () => {
    expect(
      parseLines([
        { id: 7, quantity: MAX_QUANTITY },
        { id: 7, quantity: 5 },
      ]),
    ).toEqual([{ id: 7, quantity: MAX_QUANTITY }]);
  });

  // A hand-made payload is refused outright rather than priced on a best guess.
  it.each([
    ["not an array", { id: 1, quantity: 1 }],
    ["empty", []],
    ["too many lines", Array.from({ length: 101 }, (_, i) => ({ id: i + 1, quantity: 1 }))],
    ["zero quantity", [{ id: 1, quantity: 0 }]],
    ["negative quantity", [{ id: 1, quantity: -2 }]],
    ["fractional quantity", [{ id: 1, quantity: 1.5 }]],
    ["quantity over the cap", [{ id: 1, quantity: MAX_QUANTITY + 1 }]],
    ["zero id", [{ id: 0, quantity: 1 }]],
    ["fractional id", [{ id: 1.5, quantity: 1 }]],
    ["missing fields", [{}]],
    ["a quantity that is not a number at all", [{ id: 1, quantity: "две" }]],
  ])("rejects %s", (_label, items) => {
    expect(parseLines(items)).toBeNull();
  });

  // Coercion is deliberate and safe: the value is still re-validated as an integer in range, and
  // no price ever comes from the client — a form or a JSON round-trip may legitimately stringify.
  it("coerces a numeric string quantity rather than rejecting the cart", () => {
    expect(parseLines([{ id: "1", quantity: "2" }])).toEqual([{ id: 1, quantity: 2 }]);
  });

  it("accepts a cart at the line limit", () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, quantity: 1 }));
    expect(parseLines(items)).toHaveLength(100);
  });
});

describe("buildQuote", () => {
  it("prices from the database, never from the client", async () => {
    // The client's own price for #1 is irrelevant — only ids and quantities are sent at all.
    const quote = await buildQuote(lookup([product(1, 250)]), [{ id: 1, quantity: 2 }], "center");
    expect(quote.items).toEqual([
      { id: 1, name: "Товар 1", price: 250, quantity: 2, image_url: "https://example.test/1.webp" },
    ]);
    expect(quote.itemsTotal).toBe(500);
  });

  it("reads a numeric column that arrives as a string", async () => {
    const quote = await buildQuote(lookup([product(1, "199.90")]), [{ id: 1, quantity: 3 }], "center");
    expect(quote.itemsTotal).toBe(599.7);
  });

  it("rejects a line whose product is gone or unpublished, and names nothing it cannot see", async () => {
    const quote = await buildQuote(
      lookup([product(1, 100)]),
      [
        { id: 1, quantity: 1 },
        { id: 2, quantity: 1 },
      ],
      "center",
    );
    expect(quote.items.map((i) => i.id)).toEqual([1]);
    expect(quote.rejected).toEqual([{ id: 2, name: null, reason: "missing" }]);
  });

  // The regression this guards: `Number(null)` is 0, which made such a product orderable for free.
  it.each([
    ["null", null],
    ["zero", 0],
    ["negative", -50],
    ["not a number", "цена по запросу"],
  ])("rejects a product priced %s rather than giving it away", async (_label, price) => {
    const quote = await buildQuote(lookup([product(1, price)]), [{ id: 1, quantity: 1 }], "center");
    expect(quote.items).toEqual([]);
    expect(quote.rejected).toEqual([{ id: 1, name: "Товар 1", reason: "no-price" }]);
    expect(quote.total).toBe(0);
  });

  it("falls back to an empty image rather than emitting null into a frozen order item", async () => {
    const rows: PricedProduct[] = [{ id: 1, name: "Товар 1", price: 100, image_url: null }];
    const quote = await buildQuote(lookup(rows), [{ id: 1, quantity: 1 }], "center");
    expect(quote.items[0].image_url).toBe("");
  });

  describe("delivery", () => {
    it("charges the city rate below the free threshold", async () => {
      const quote = await buildQuote(lookup([product(1, 9999)]), [{ id: 1, quantity: 1 }], "center");
      expect(quote.deliveryCost).toBe(200);
      expect(quote.total).toBe(10199);
    });

    it("is free at exactly the threshold for a zone that qualifies", async () => {
      const quote = await buildQuote(lookup([product(1, 10000)]), [{ id: 1, quantity: 1 }], "center");
      expect(quote.deliveryCost).toBe(0);
      expect(quote.total).toBe(10000);
    });

    it("keeps charging жилмассивы past the threshold — that zone has no free tier", async () => {
      const quote = await buildQuote(lookup([product(1, 50000)]), [{ id: 1, quantity: 1 }], "residential");
      expect(quote.deliveryCost).toBe(300);
      expect(quote.total).toBe(50300);
    });

    it.each(["regions", "urgent"])("charges nothing up front for %s, which is settled off-site", async (zone) => {
      const quote = await buildQuote(lookup([product(1, 500)]), [{ id: 1, quantity: 1 }], zone);
      expect(quote.deliveryCost).toBe(0);
      expect(quote.total).toBe(500);
    });

    it("charges nothing for an unknown zone instead of inventing a rate", async () => {
      const quote = await buildQuote(lookup([product(1, 500)]), [{ id: 1, quantity: 1 }], "moon");
      expect(quote.deliveryCost).toBe(0);
    });

    // The free threshold must be met by goods that survived, not by what the client asked for.
    it("does not let a rejected line buy free delivery", async () => {
      const quote = await buildQuote(
        lookup([product(1, 500), product(2, null, "Без цены")]),
        [
          { id: 1, quantity: 1 },
          { id: 2, quantity: 1 },
        ],
        "center",
      );
      expect(quote.itemsTotal).toBe(500);
      expect(quote.deliveryCost).toBe(200);
      expect(quote.rejected).toHaveLength(1);
    });
  });

  it("surfaces a lookup failure instead of quoting an empty cart", async () => {
    const failing = async () => {
      throw new Error("[checkout] product lookup failed: boom");
    };
    await expect(buildQuote(failing, [{ id: 1, quantity: 1 }], "center")).rejects.toThrow("product lookup failed");
  });

  it("keeps two decimals, so a float artefact never reaches a customer", async () => {
    const quote = await buildQuote(
      lookup([product(1, 0.1), product(2, 0.2)]),
      [
        { id: 1, quantity: 1 },
        { id: 2, quantity: 1 },
      ],
      "urgent",
    );
    expect(quote.itemsTotal).toBe(0.3);
    expect(money(0.1 + 0.2)).toBe(0.3);
  });
});
