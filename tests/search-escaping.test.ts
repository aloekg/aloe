import { describe, expect, it } from "vitest";
import { escapeLike, parseProductId } from "@/services/product.service";

describe("escapeLike", () => {
  // % and _ are LIKE wildcards and PostgREST additionally rewrites * to %, so an unescaped
  // term of "%" matched the entire catalogue: a full sequential scan plus an exact COUNT.
  it("neutralises wildcards so they match literally", () => {
    expect(escapeLike("%")).toBe("\\%");
    expect(escapeLike("_")).toBe("\\_");
    expect(escapeLike("50%")).toBe("50\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
  });

  it("strips *, which PostgREST would turn into %", () => {
    expect(escapeLike("*")).toBe("");
    expect(escapeLike("кре*м")).toBe("крем");
  });

  it("escapes the escape character itself", () => {
    expect(escapeLike("\\")).toBe("\\\\");
    // Ordering matters: escaping the backslash after % would double-escape it.
    expect(escapeLike("\\%")).toBe("\\\\\\%");
  });

  it("leaves ordinary search terms untouched", () => {
    expect(escapeLike("крем для рук")).toBe("крем для рук");
    expect(escapeLike("Nivea 250 мл")).toBe("Nivea 250 мл");
  });
});

describe("parseProductId", () => {
  it("recognises a digits-only term as a product id", () => {
    expect(parseProductId("8365")).toBe("8365");
    expect(parseProductId("  9547  ")).toBe("9547");
  });

  it("does not treat a term that merely contains digits as an id", () => {
    expect(parseProductId("500 мл")).toBeNull();
    expect(parseProductId("Fusion 4")).toBeNull();
    expect(parseProductId("")).toBeNull();
  });

  // The value is interpolated into a PostgREST .or() filter, which is a parsed expression rather
  // than a bound parameter — so anything that is not purely digits must not reach it.
  it("rejects anything that would need escaping in an or() filter", () => {
    expect(parseProductId("1,name.ilike.*")).toBeNull();
    expect(parseProductId("8365)")).toBeNull();
    expect(parseProductId("-1")).toBeNull();
    expect(parseProductId("1.5")).toBeNull();
    expect(parseProductId("%")).toBeNull();
  });

  // Wider than bigint makes Postgres reject the whole query instead of matching nothing.
  it("refuses a number too wide to be an id", () => {
    expect(parseProductId("9".repeat(15))).toBe("9".repeat(15));
    expect(parseProductId("9".repeat(16))).toBeNull();
  });
});
