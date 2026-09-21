import { describe, expect, it } from "vitest";
import { parseBrandIds, parsePage, parseQuery, parseSortParam } from "@/lib/page-params";

describe("parsePage", () => {
  // `Math.max(1, parseInt("abc"))` is NaN, which reached .range(NaN, NaN) and made the page
  // render "found: 0" while swallowing the PostgREST error. Crawlers hit this constantly.
  it.each([["abc"], ["-5"], ["0"], [""], ["1e3"], ["NaN"], [undefined]])("never returns NaN for %j", (input) => {
    const result = parsePage(input);
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(1);
  });

  it("passes through valid pages and truncates decimals", () => {
    expect(parsePage("7")).toBe(7);
    expect(parsePage("3.9")).toBe(3);
  });

  it("caps absurd offsets", () => {
    expect(parsePage("99999999")).toBe(500);
  });
});

describe("parseBrandIds", () => {
  it("drops anything that is not a positive integer", () => {
    expect(parseBrandIds("foo")).toEqual([]);
    expect(parseBrandIds(["1", "foo", "-3", "0", "2.5"])).toEqual([1]);
    expect(parseBrandIds(undefined)).toEqual([]);
  });

  it("accepts single and repeated params", () => {
    expect(parseBrandIds("12")).toEqual([12]);
    expect(parseBrandIds(["1", "2"])).toEqual([1, 2]);
  });
});

describe("parseSortParam", () => {
  it("falls back to name for unknown values", () => {
    expect(parseSortParam("price_asc")).toBe("price_asc");
    expect(parseSortParam("price_desc")).toBe("price_desc");
    expect(parseSortParam("'; drop table products;--")).toBe("name");
    expect(parseSortParam(undefined)).toBe("name");
  });
});

describe("parseQuery", () => {
  it("trims, so a whitespace-only term reads as no term at all", () => {
    expect(parseQuery("  вода  ")).toBe("вода");
    expect(parseQuery("   ")).toBe("");
    expect(parseQuery(undefined)).toBe("");
  });

  it("caps the term, since /search is public and every load costs an ilike scan plus a COUNT", () => {
    expect(parseQuery("a".repeat(5000))).toHaveLength(100);
  });
});
