import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Shared mocks for modules the handler uses
vi.mock("../../api/_util/http", () => {
  const headers = new Headers({ "X-Correlation-Id": "test-cid", "Cache-Control": "no-store" });
  return {
    baseHeaders: vi.fn(() => new Headers(headers)),
    guardMethod: vi.fn(() => null),
    guardJson: vi.fn(() => null),
    parseJsonBody: vi.fn(async () => ({ rulesetCode: "CA-default" })),
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
vi.mock("../../src/schemas/responseFactory", () => ({ makeOk: vi.fn(() => ({ payment: 100 })) }));
vi.mock("../../src/pdf/templates", () => ({
  renderMortgagePdf: vi.fn(() => new Uint8Array([1, 2, 3, 4, 5])),
}));

async function loadHandler() {
  const mod = await import("../../api/pdf");
  return { handler: mod.default };
}

const URL_P = "https://unit.test/api/pdf";

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("api/pdf.ts handler", () => {
  it("returns 200 PDF stream with inline disposition by default", async () => {
    const { handler } = await loadHandler();
    const req = new Request(`${URL_P}?disposition=inline`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/pdf" },
      body: JSON.stringify({ rulesetCode: "CA-default" }),
    });

    const resp = await handler(req);

    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type") ?? "").toContain("application/pdf");
    expect(resp.headers.get("content-disposition") ?? "").toContain("inline");
    expect(resp.headers.get("pragma") ?? "").toContain("no-cache");
    expect(resp.headers.get("cache-control") ?? "").toContain("no-store");
    expect(resp.headers.get("x-correlation-id")).toBeTruthy();
    expect(resp.headers.get("x-duration-ms")).toBeTruthy();

    const buf = await resp.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("returns attachment disposition when requested", async () => {
    const { handler } = await loadHandler();
    const req = new Request(`${URL_P}?disposition=attachment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/pdf" },
      body: JSON.stringify({}),
    });

    const resp = await handler(req);
    const disp = resp.headers.get("content-disposition") ?? "";

    expect(disp).toContain("attachment");
    expect(disp).toContain('filename="mortgage.pdf"');
  });

  it("short-circuits on guards and rate limit", async () => {
    const http = await import("../../api/_util/http");

    (http.guardMethod as any).mockReturnValueOnce(new Response(null, { status: 405 }));
    let resp = await (await loadHandler()).handler(new Request(URL_P, { method: "GET" }));
    expect(resp.status).toBe(405);

    (http.guardMethod as any).mockReturnValueOnce(null);
    (http.guardJson as any).mockReturnValueOnce(new Response(null, { status: 415 }));
    resp = await (await loadHandler()).handler(new Request(URL_P, { method: "POST" }));
    expect(resp.status).toBe(415);

    (http.guardJson as any).mockReturnValueOnce(null);
    (http.applyRateLimit as any).mockResolvedValueOnce(new Response(null, { status: 429 }));
    resp = await (await loadHandler()).handler(new Request(URL_P, { method: "POST" }));
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
    const resp = await handler(new Request(URL_P, { method: "POST" }));

    expect(sendSpy).toHaveBeenCalledWith(expect.any(Request), 400, "VALIDATION_ERROR", expect.any(Object));
    expect(resp.status).toBe(400);
  });

  it("maps thrown error to sendError(http, code)", async () => {
    const http = await import("../../api/_util/http");
    (http.parseJsonBody as any).mockRejectedValueOnce({ http: 500, code: "INTERNAL_SERVER_ERROR", msg: "boom" });

    const sendSpy = vi.spyOn(http, "sendError");

    const { handler } = await loadHandler();
    const resp = await handler(new Request(URL_P, { method: "POST" }));

    expect(sendSpy).toHaveBeenCalledWith(expect.any(Request), 500, "INTERNAL_SERVER_ERROR", expect.any(Object));
    expect(resp.status).toBe(500);
  });
});
