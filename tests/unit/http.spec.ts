import { describe, it, expect } from "vitest";
import {
  baseHeaders, correlationId, guardMethod, guardJson, parseJsonBody, sendError
} from "../../api/_util/http";

function req(init: RequestInit & { url?: string; origin?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.origin) headers.set("Origin", init.origin);
  return new Request(init.url ?? "https://ex.com/api/test", { method: init.method ?? "POST", headers, body: init.body });
}

describe("http utils: headers/cors/correlation", () => {
  it("baseHeaders sets defaults and content type + correlation id", () => {
    const h = baseHeaders(req(), "application/json; charset=utf-8");
    expect(h.get("Cache-Control")).toBe("no-store");
    expect(h.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(h.get("Access-Control-Allow-Headers")).toContain("Content-Type");
    expect(h.get("Content-Type")).toBe("application/json; charset=utf-8");

    const cid = h.get("X-Correlation-Id");
    expect(cid).toBeTruthy();
    expect(correlationId(req())).toBeTypeOf("string");
  });

  it("CORS allowlist only when Origin strictly matches UI_ORIGIN", () => {
    const ui = process.env.UI_ORIGIN;
    const h1 = baseHeaders(req({ origin: "https://nope.example" }));
    expect(h1.get("Access-Control-Allow-Origin")).toBeNull();

    if (ui) {
      const h2 = baseHeaders(req({ origin: ui }));
      expect(h2.get("Access-Control-Allow-Origin")).toBe(ui);
      expect(h2.get("Vary")).toContain("Origin");
    }
  });
});

describe("http utils: guards + parsing", () => {
  it("guardMethod: OPTIONS short-circuits with 204", () => {
    const headers = baseHeaders(req({ method: "OPTIONS" }));
    const r = guardMethod(req({ method: "OPTIONS" }), headers);
    expect(r?.status).toBe(204);
  });

  it("guardMethod: wrong verb yields 405", async () => {
    const headers = baseHeaders(req({ method: "GET" }));
    const r = guardMethod(req({ method: "GET" }), headers, "POST");
    expect(r?.status).toBe(405);
    const j = await r?.json();
    expect(j.error).toBe("METHOD_NOT_ALLOWED");
  });

  it("guardJson: rejects non-JSON content-type", async () => {
    const r = guardJson(req({ headers: { "Content-Type": "text/plain" } }));
    expect(r?.status).toBe(415);
    const j = await r?.json();
    expect(j.error).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("guardJson: rejects payload too large by Content-Length", () => {
    const r = guardJson(req({ headers: { "Content-Type": "application/json", "Content-Length": "10001" } }));
    expect(r?.status).toBe(413);
  });

  it("guardJson: ok passes through", () => {
    const r = guardJson(req({ headers: { "Content-Type": "application/json" } }));
    expect(r).toBeNull();
  });

  it("parseJsonBody: parses JSON and handles empty body", async () => {
    const r1 = await parseJsonBody(req({ body: JSON.stringify({ a: 1 }) }));
    expect(r1).toMatchObject({ a: 1 });

    const r2 = await parseJsonBody(req()); // no body
    expect(r2).toEqual({});
  });

  it("parseJsonBody: throws BAD_REQUEST on invalid JSON", async () => {
    await expect(parseJsonBody(req({ body: "{ oops" }))).rejects.toMatchObject({
      http: 400, code: "BAD_REQUEST",
    });
  });
});

describe("http utils: sendError", () => {
  it("sendError returns JSON error with same correlation id in header/body", async () => {
    const r = sendError(req(), 400, "BAD_REQUEST", { msg: "nope" });
    expect(r.status).toBe(400);
    expect(r.headers.get("Content-Type")).toContain("application/json");
    const cid = r.headers.get("X-Correlation-Id");
    expect(cid).toBeTruthy();
    const j: any = await r.json();
    expect(j.error).toBe("BAD_REQUEST");
    expect(j.correlationId).toBe(cid);
  });
});
