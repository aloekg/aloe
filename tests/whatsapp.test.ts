import { describe, expect, it } from "vitest";
import { ORDER_STATUS } from "@/lib/constants";
import { orderStatusMessage, toWhatsAppNumber, whatsAppLink } from "@/lib/whatsapp";

describe("toWhatsAppNumber", () => {
  it("accepts the spellings checkout actually stores", () => {
    // Every one of these is the same subscriber, and all of them pass checkout's nine-digit check.
    expect(toWhatsAppNumber("+996 555 123 456")).toBe("996555123456");
    expect(toWhatsAppNumber("+996555123456")).toBe("996555123456");
    expect(toWhatsAppNumber("996555123456")).toBe("996555123456");
    expect(toWhatsAppNumber("0555 123 456")).toBe("996555123456");
    expect(toWhatsAppNumber("0555123456")).toBe("996555123456");
    expect(toWhatsAppNumber("555123456")).toBe("996555123456");
    expect(toWhatsAppNumber("00996555123456")).toBe("996555123456");
    expect(toWhatsAppNumber("(0555) 12-34-56")).toBe("996555123456");
  });

  it("handles the two shapes customers most often type", () => {
    // Straight from real orders: a leading 0, and nine bare digits with neither 0 nor 996.
    expect(toWhatsAppNumber("0505008085")).toBe("996505008085");
    expect(toWhatsAppNumber("709272740")).toBe("996709272740");
  });

  it("reads a leading 8 as the Soviet-era trunk prefix", () => {
    expect(toWhatsAppNumber("8 505 008 085")).toBe("996505008085");
    expect(toWhatsAppNumber("8996505008085")).toBe("996505008085");
  });

  it("keeps a foreign number that was written in international form", () => {
    expect(toWhatsAppNumber("+7 999 123 45 67")).toBe("79991234567");
    // Ten digits starting with 8 — the trunk-prefix rule must not claim it for Kyrgyzstan.
    expect(toWhatsAppNumber("+82 2 123 4567")).toBe("8221234567");
  });

  it("refuses to guess rather than open a chat with a stranger", () => {
    expect(toWhatsAppNumber(null)).toBeNull();
    expect(toWhatsAppNumber("")).toBeNull();
    expect(toWhatsAppNumber("не указан")).toBeNull();
    expect(toWhatsAppNumber("12345")).toBeNull();
    // 11 digits with no plus: a mistyped local number far more often than a foreign one.
    expect(toWhatsAppNumber("05551234567")).toBeNull();
    // No country code starts with 0, so this is a mangled local number, not an international one.
    expect(toWhatsAppNumber("+0505008085")).toBeNull();
  });
});

describe("whatsAppLink", () => {
  it("builds a wa.me link with the message prefilled", () => {
    expect(whatsAppLink("0555123456", "Привет!")).toBe(
      "https://wa.me/996555123456?text=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82!",
    );
  });

  it("omits the query when there is no message", () => {
    expect(whatsAppLink("0555123456")).toBe("https://wa.me/996555123456");
  });

  it("is null for an unusable phone, so the caller can render plain text", () => {
    expect(whatsAppLink("не указан", "Привет!")).toBeNull();
  });
});

describe("orderStatusMessage", () => {
  it("covers every status the admin can set", () => {
    for (const status of Object.keys(ORDER_STATUS)) {
      const text = orderStatusMessage({ orderId: 42, status, total: 1500 });
      expect(text).toContain("Aloe.kg");
      expect(text).toContain("42");
    }
  });

  it("names the amount while the order is still being agreed", () => {
    expect(orderStatusMessage({ orderId: 42, status: "new", total: 1500 })).toContain("1500 сом");
    expect(orderStatusMessage({ orderId: 42, status: "confirmed", total: 1500 })).toContain("1500 сом");
  });

  it("still produces a usable greeting for a status it does not know", () => {
    const text = orderStatusMessage({ orderId: 42, status: "refunded", total: 1500 });
    expect(text).toContain("Aloe.kg");
    expect(text).toContain("refunded");
  });
});
