import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const okBody = { payment: 2396.99, breakdown: { paymentsPerYear: 12 } };

// --- Shared mocks for modules the handler uses
vi.mock("../../api/_util/http", async () => {
  const actual = await vi.importActual<any>("../../api/_util/http");
  return {
    baseHeaders: (req: Request, ct?: string) => actual.baseHeaders(req, ct),
    guardMethod: vi.fn(() => null),
    guardJson: vi.fn(() => null),
    parseJsonBody: vi.fn(async () => ({ rulesetCode: "CA-Default" })),
    applyRateLimit: vi.fn(async () => null),
    sendError: vi.fn((req: Request, http: number) => new Response(JSON.stringify({ error: http }), { status: http })),
  };
});
vi.mock("../../src/schemas/requestFactory", () => {
  return {
    createSchemaForRuleset: vi.fn(() => ({
      safeParse: vi.fn((raw: unknown) => ({ success: true, data: raw })),
    })),
  };
});
vi.mock("../../src/rulesets", () => ({ isRulesetCode: vi.fn(() => true) }));
vi.mock("../../src/engine", () => ({ computeResultsDynamic: vi.fn(() => ({ result: "ok" })) }));
vi.mock("../../src/schemas/responseFactory", () => ({ makeOk: vi.fn(() => okBody) }));

// util to get fresh handler with current mocks wired
async function loadHandler() {
  const mod = await import("../../api/mortgage");
  return { handler: mod.default };
}

const URL_M = "https://unit.test/api/mortgage";

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api/mortgage.ts handler", () => {
  it("returns 200 JSON with expected headers and body on happy path", async () => {
    const { handler } = await loadHandler();
    const req = new Request(URL_M, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ rulesetCode: "CA-Default" }),
    });

    const resp = await handler(req);

    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type") ?? "").toContain("application/json");
    expect(resp.headers.get("cache-control") ?? "").toContain("no-store");
    expect(resp.headers.get("x-correlation-id")).toBeTruthy();
    expect(resp.headers.get("x-duration-ms")).toBeTruthy();

    const json = (await resp.json()) as any;
    expect(json).toEqual(okBody);
  });

  it("short-circuits when guardMethod returns a Response (405)", async () => {
    const http = await import("../../api/_util/http");
    (http.guardMethod as any).mockReturnValueOnce(new Response(null, { status: 405 }));

    const { handler } = await loadHandler();
    const req = new Request(URL_M, { method: "GET" });

    const resp = await handler(req);
    expect(resp.status).toBe(405);
  });

  it("short-circuits when guardJson returns a Response (415)", async () => {
    const http = await import("../../api/_util/http");
    (http.guardJson as any).mockReturnValueOnce(new Response(null, { status: 415 }));

    const { handler } = await loadHandler();
    const req = new Request(URL_M, { method: "POST" });

    const resp = await handler(req);
    expect(resp.status).toBe(415);
  });

  it("short-circuits when applyRateLimit returns a Response (429)", async () => {
    const http = await import("../../api/_util/http");
    (http.applyRateLimit as any).mockResolvedValueOnce(new Response(null, { status: 429 }));

    const { handler } = await loadHandler();
    const req = new Request(URL_M, { method: "POST" });

    const resp = await handler(req);
    expect(resp.status).toBe(429);
  });

  it("returns 400 via sendError when schema validation fails", async () => {
    const schema = await import("../../src/schemas/requestFactory");
    (schema.createSchemaForRuleset as any).mockReturnValueOnce({
      safeParse: vi.fn(() => ({ success: false })),
    });

    const http = await import("../../api/_util/http");
    const sendSpy = vi.spyOn(http, "sendError");

    const { handler } = await loadHandler();
    const req = new Request(URL_M, { method: "POST" });

    const resp = await handler(req);
    expect(sendSpy).toHaveBeenCalledWith(expect.any(Request), 400, "VALIDATION_ERROR", expect.any(Object));
    expect(resp.status).toBe(400);
  });

  it("maps thrown error objects to sendError(http, code)", async () => {
    const http = await import("../../api/_util/http");
    (http.parseJsonBody as any).mockRejectedValueOnce({ http: 400, code: "BAD_REQUEST", msg: "invalid" });

    const sendSpy = vi.spyOn(http, "sendError");

    const { handler } = await loadHandler();
    const req = new Request(URL_M, { method: "POST" });

    const resp = await handler(req);
    expect(sendSpy).toHaveBeenCalledWith(expect.any(Request), 400, "BAD_REQUEST", expect.any(Object));
    expect(resp.status).toBe(400);
  });
});
