import { beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` is neutralised once in vitest.config.mts. These stand in for the request context
// and the service-role client so the fail-open contract can be asserted without a database.
const headerValues = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => headerValues.get(name) ?? null }),
}));

const rpc = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({ createAdminClient: () => ({ rpc }) }));

const { rateLimit } = await import("@/lib/rate-limit");

const args = { limit: 5, windowSeconds: 60 };

beforeEach(() => {
  headerValues.clear();
  headerValues.set("x-forwarded-for", "203.0.113.9");
  rpc.mockReset();
  vi.restoreAllMocks();
});

describe("rateLimit", () => {
  it("allows the call when the counter is under the limit", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await rateLimit("create-order", args)).toEqual({ allowed: true });
  });

  it("blocks only on an explicit false", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await rateLimit("create-order", args)).toEqual({ allowed: false });
  });

  // The whole point of the design: a broken limiter must never cost a real sale. These two are the
  // cases that would silently invert into "nobody can order" if the fallback were flipped.
  it("fails open when the RPC returns an error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    expect(await rateLimit("create-order", args)).toEqual({ allowed: true });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("function does not exist"));
  });

  it("fails open when the call throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockRejectedValue(new Error("connection refused"));
    expect(await rateLimit("create-order", args)).toEqual({ allowed: true });
  });

  // A null payload is not a "false" — treating it as one would block every request the moment the
  // RPC's return type changed.
  it("fails open on a null payload", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await rateLimit("create-order", args)).toEqual({ allowed: true });
  });
});

describe("client key", () => {
  const keyOf = async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await rateLimit("b", args);
    return rpc.mock.calls.at(-1)![1].p_key;
  };

  // The proxy appends, so the client is leftmost. Reading the last entry would bucket every
  // visitor under the proxy's own address and throttle the whole site as one.
  it("takes the leftmost x-forwarded-for entry", async () => {
    headerValues.set("x-forwarded-for", "203.0.113.9, 70.41.3.18, 10.0.0.1");
    expect(await keyOf()).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip", async () => {
    headerValues.clear();
    headerValues.set("x-real-ip", " 198.51.100.7 ");
    expect(await keyOf()).toBe("198.51.100.7");
  });

  // A shared bucket, not an exemption: without headers everyone throttles collectively rather
  // than not at all.
  it("uses a shared bucket when no address is present", async () => {
    headerValues.clear();
    expect(await keyOf()).toBe("unknown");
  });

  it("ignores an empty header rather than keying on the empty string", async () => {
    headerValues.set("x-forwarded-for", "  ");
    expect(await keyOf()).toBe("unknown");
  });
});
