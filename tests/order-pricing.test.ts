import { describe, expect, it } from "vitest";
import { DELIVERY_OPTIONS, FREE_DELIVERY_THRESHOLD } from "@/lib/constants";
import {
  buildQuote,
  isManualDeliveryCost,
  itemsTotalOf,
  MAX_ITEM_NAME,
  MAX_ITEM_PRICE,
  MAX_QUANTITY,
  money,
  normalizeOrderItems,
  parseLines,
  parsePriceInput,
  priceOrder,
  validateDeliveryInput,
  validateOrderItems,
  type OrderItemInput,
  type PricedProduct,
} from "@/lib/order-pricing";

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

/** A sound admin-edited line; individual tests override the one field they are about. */
const line = (over: Partial<OrderItemInput> = {}): OrderItemInput => ({
  id: 1,
  name: "Товар",
  price: 100,
  quantity: 2,
  image_url: "https://example.test/1.webp",
  ...over,
});

describe("validateOrderItems", () => {
  it("accepts a sound basket", () => {
    expect(validateOrderItems([line(), line({ id: 2 })])).toBeNull();
  });

  it("accepts a zero price — the admin writing off a line is not a broken row", () => {
    expect(validateOrderItems([line({ price: 0 })])).toBeNull();
  });

  it.each([
    ["an empty basket", [], "В заказе должен остаться хотя бы один товар"],
    ["not an array", null as unknown as OrderItemInput[], "В заказе должен остаться хотя бы один товар"],
    [
      "more than MAX_LINES",
      Array.from({ length: 101 }, (_, i) => line({ id: i + 1 })),
      "Слишком много позиций — не больше 100",
    ],
    ["a zero id", [line({ id: 0 })], "Некорректная позиция заказа"],
    ["a fractional id", [line({ id: 1.5 })], "Некорректная позиция заказа"],
    ["the same product twice", [line(), line()], "Один товар не может быть в заказе дважды"],
    ["a blank name", [line({ name: "   " })], "Укажите название товара"],
    ["a non-string name", [line({ name: 7 as unknown as string })], "Укажите название товара"],
    ["an over-long name", [line({ name: "я".repeat(MAX_ITEM_NAME + 1) })], "Название товара длиннее 200 символов"],
    ["a null price", [line({ price: null })], "Укажите цену товара числом"],
    ["a NaN price", [line({ price: NaN })], "Укажите цену товара числом"],
    ["an infinite price", [line({ price: Infinity })], "Укажите цену товара числом"],
    ["a negative price", [line({ price: -1 })], "Цена товара не может быть отрицательной"],
    ["a price over the cap", [line({ price: MAX_ITEM_PRICE + 1 })], "Цена товара не может превышать 1 000 000"],
    ["a zero quantity", [line({ quantity: 0 })], "Количество должно быть целым положительным числом"],
    ["a fractional quantity", [line({ quantity: 1.5 })], "Количество должно быть целым положительным числом"],
    ["a quantity over the cap", [line({ quantity: MAX_QUANTITY + 1 })], "Количество не может превышать 999"],
  ])("rejects %s", (_case, items, message) => {
    expect(validateOrderItems(items)).toBe(message);
  });
});

describe("normalizeOrderItems", () => {
  it("trims the name, rounds the price and fills in a missing image", () => {
    expect(normalizeOrderItems([line({ name: "  Алоэ гель  ", price: 1250.456, image_url: null })])).toEqual([
      { id: 1, name: "Алоэ гель", price: 1250.46, quantity: 2, image_url: "" },
    ]);
  });
});

describe("itemsTotalOf", () => {
  it("treats a null price as nothing rather than NaN", () => {
    expect(
      itemsTotalOf([
        { price: null, quantity: 3 },
        { price: 100, quantity: 2 },
      ]),
    ).toBe(200);
  });
});

describe("priceOrder", () => {
  const goods = (total: number) => [{ price: total, quantity: 1 }];

  it("charges the tariff below the free-delivery threshold and waives it above", () => {
    expect(priceOrder(goods(FREE_DELIVERY_THRESHOLD - 1), "center").deliveryCost).toBe(200);
    expect(priceOrder(goods(FREE_DELIVERY_THRESHOLD), "center").deliveryCost).toBe(0);
    expect(priceOrder(goods(FREE_DELIVERY_THRESHOLD * 10), "residential").deliveryCost).toBe(300);
  });

  it("lets a manual fee override the tariff, zero included", () => {
    // Guards the `>= 0` check against collapsing into a truthiness test: a fee agreed as free is
    // still a decision, not a missing value.
    expect(priceOrder(goods(5000), "center", 0).deliveryCost).toBe(0);
    expect(priceOrder(goods(5000), "regions", 500).deliveryCost).toBe(500);
  });

  it.each([[null], [undefined]])("falls back to the tariff for %s", (manual) => {
    expect(priceOrder(goods(5000), "center", manual).deliveryCost).toBe(200);
  });

  it("totals the goods and the delivery at two decimals", () => {
    const pricing = priceOrder(
      [
        { price: 0.1, quantity: 1 },
        { price: 0.2, quantity: 1 },
      ],
      "regions",
    );
    expect(pricing.itemsTotal).toBe(0.3);
    expect(pricing.total).toBe(pricing.itemsTotal + pricing.deliveryCost);
  });
});

describe("isManualDeliveryCost", () => {
  it("does not flag an order created through checkout", () => {
    expect(isManualDeliveryCost(200, "center", 5000)).toBe(false);
    expect(isManualDeliveryCost(300, "residential", 5000)).toBe(false);
    expect(isManualDeliveryCost(0, "regions", 5000)).toBe(false);
  });

  it("does not mistake waived delivery for a hand-entered fee", () => {
    expect(isManualDeliveryCost(0, "center", FREE_DELIVERY_THRESHOLD)).toBe(false);
  });

  it("flags a fee the tariff cannot explain", () => {
    expect(isManualDeliveryCost(500, "regions", 5000)).toBe(true);
    expect(isManualDeliveryCost(0, "residential", 5000)).toBe(true);
  });
});

describe("validateDeliveryInput", () => {
  it("covers every configured option", () => {
    for (const option of DELIVERY_OPTIONS) {
      expect(validateDeliveryInput(option.id, null)).toBeNull();
    }
  });

  it("accepts a manual fee at the edges of the allowed range", () => {
    expect(validateDeliveryInput("regions", 0)).toBeNull();
    expect(validateDeliveryInput("regions", 100_000)).toBeNull();
  });

  it.each([
    ["an unknown option", "nope", null, "Неизвестный способ доставки"],
    ["a NaN fee", "regions", NaN, "Укажите стоимость доставки числом"],
    ["an infinite fee", "regions", Infinity, "Укажите стоимость доставки числом"],
    ["a negative fee", "regions", -1, "Стоимость доставки не может быть отрицательной"],
    ["a fee over the cap", "regions", 100_001, "Стоимость доставки не может превышать 100 000"],
  ])("rejects %s", (_case, type, cost, message) => {
    expect(validateDeliveryInput(type, cost)).toBe(message);
  });
});

describe("parsePriceInput", () => {
  it.each([
    ["1250", 1250],
    ["1 250", 1250],
    ["1250,50", 1250.5],
    ["1250.5", 1250.5],
    ["0", 0],
  ])("parses %s", (input, expected) => {
    expect(parsePriceInput(input)).toBe(expected);
  });

  it.each([[""], ["   "], ["12."], ["abc"], ["-5"], ["1.005"], ["1,2,3"]])("rejects %s", (input) => {
    expect(parsePriceInput(input)).toBeNull();
  });
});
