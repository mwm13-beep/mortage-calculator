// tests/unit/http.ratelimit.spec.ts
import { describe, it, expect, vi, afterEach } from "vitest";

/** Re-import http util with optional env + mocked limiter */
async function loadHttp(opts?: {
  url?: string;
  token?: string;
  limitResult?: { success: boolean; limit: number; remaining: number; reset: number };
}) {
  // Fresh module graph
  vi.resetModules();

  // Env for this import only
  vi.stubEnv("UPSTASH_REDIS_REST_URL", opts?.url ?? "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", opts?.token ?? "");
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("KV_REST_API_TOKEN", "");

  // Clear any previous runtime mocks
  vi.unmock("@upstash/redis");
  vi.unmock("@upstash/ratelimit");

  // If we want a working limiter, mock the Upstash libs BEFORE import
  if (opts?.limitResult) {
    await vi.doMock("@upstash/redis", async () => ({
      // minimal shape so Ratelimit can construct
      Redis: class { constructor(_: any) {} },
    }));

    await vi.doMock("@upstash/ratelimit", async () => {
      const res = opts.limitResult!;
      class FakeRateLimit {
        static slidingWindow() { return "window"; }
        constructor(_: any) {}
        async limit(_: string) { return res; }
      }
      return { Ratelimit: FakeRateLimit };
    });
  }

  // Import AFTER env + mocks are set so our mocks are used
  return await import("../../api/_util/http");
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.unmock("@upstash/redis");
  vi.unmock("@upstash/ratelimit");
});

describe("rate limit helpers", () => {
  it("getRateLimiter => null when env missing", async () => {
    const http = await loadHttp(); // no env, no mocks
    expect(http.getRateLimiter()).toBeNull();
  });

  it("applyRateLimit => 500 when limiter unavailable", async () => {
    const http = await loadHttp(); // no env, so limiter = null
    const req = new Request("https://x");
    const headers = http.baseHeaders(req);
    const res = await http.applyRateLimit(req, headers);
    expect(res?.status).toBe(500);
  });

  it("applyRateLimit => null (allowed) and sets headers on success", async () => {
    const http = await loadHttp({
      url: "https://example.invalid",  // any https value; we won't actually fetch
      token: "t",
      limitResult: { success: true, limit: 10, remaining: 9, reset: 123 },
    });
    const req = new Request("https://x", {
      headers: { "user-agent": "ua", "x-forwarded-for": "1.2.3.4" },
    });
    const headers = http.baseHeaders(req);
    const res = await http.applyRateLimit(req, headers);

    expect(res).toBeNull(); // allowed
    expect(headers.get("x-ratelimit-limit")).toBe("10");
    expect(headers.get("x-ratelimit-remaining")).toBe("9");
    expect(headers.get("x-ratelimit-reset")).toBe("123");
  });

  it("applyRateLimit => 429 with headers on deny", async () => {
    const http = await loadHttp({
      url: "https://example.invalid",
      token: "t",
      // ❗ Deny case: success must be false
      limitResult: { success: false, limit: 10, remaining: 0, reset: 555 },
    });
    const req = new Request("https://x");
    const headers = http.baseHeaders(req);
    const res = await http.applyRateLimit(req, headers);

    expect(res?.status).toBe(429);
    expect(headers.get("x-ratelimit-limit")).toBe("10");
    expect(headers.get("x-ratelimit-remaining")).toBe("0");
    expect(headers.get("x-ratelimit-reset")).toBe("555");
  });
});
