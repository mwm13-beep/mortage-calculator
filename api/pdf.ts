// api/pdf.ts — Edge-secured PDF endpoint
export const config = { runtime: "edge" };

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createSchemaForRuleset } from "../src/schemas/requestFactory";
import { isRulesetCode } from "../src/rulesets";
import { IS_DEV, IS_PROD } from "./env";
import { computeResultsDynamic } from "../src/engine";

// ---------- Types ----------
type ApiErrorCode =
  | "METHOD_NOT_ALLOWED" | "UNSUPPORTED_MEDIA_TYPE" | "PAYLOAD_TOO_LARGE" | "BAD_REQUEST"
  | "VALIDATION_ERROR" | "INVALID_PRINCIPAL" | "TOO_MANY_REQUESTS" | "INTERNAL_SERVER_ERROR";

// ---------- CORS / common headers ----------
const ALLOW_ORIGIN = process.env.UI_ORIGIN;

function commonHeaders(req: Request): Headers {
  const h = new Headers();
  const origin = req.headers.get("origin");
  if (origin && ALLOW_ORIGIN && origin === ALLOW_ORIGIN) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
  }
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  // NOTE: do NOT set JSON content-type here; the final response will be PDF
  h.set("Cache-Control", "no-store");
  return h;
}

function devDetails(err: unknown) {
  if (!IS_DEV) return undefined;
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return { message: String(err) };
}

function correlationId(req: Request): string {
  return (
    req.headers.get("x-vercel-id") ||
    req.headers.get("x-request-id") ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function sendError(
  req: Request,
  httpStatus: number,
  code: ApiErrorCode,
  opts?: { msg?: string; extra?: Record<string, unknown>; err?: unknown }
): Response {
  const cid = correlationId(req);
  if (opts?.err !== undefined) console.error(`[${cid}] ${code}`, opts.msg ?? "", opts.err);
  else console.warn(`[${cid}] ${code}`, opts?.msg ?? "", IS_DEV ? opts?.extra ?? {} : undefined);

  const headers = commonHeaders(req);
  headers.set("X-Correlation-Id", cid);
  headers.set("Content-Type", "application/json; charset=utf-8");

  if (IS_PROD && httpStatus >= 500) {
    return new Response(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }), { status: 500, headers });
  }

  const body: Record<string, unknown> = { error: code, correlationId: cid };
  if (opts?.msg && IS_DEV) body.message = opts.msg;
  if (opts?.extra && IS_DEV) body.details = opts.extra;
  if (opts?.err && IS_DEV) body.errorObject = devDetails(opts.err);

  return new Response(JSON.stringify(body), { status: httpStatus, headers });
}

// ---------- Rate limit (Edge-safe) ----------
let _ratelimit: Ratelimit | null | undefined = undefined;
function getRateLimiter(): Ratelimit | null {
  if (_ratelimit !== undefined) return _ratelimit;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) {
    console.warn("[ratelimit init] missing env", { hasUrl: !!url, hasToken: !!token, ve: process.env.VERCEL_ENV });
    _ratelimit = null; return _ratelimit;
  }
  try {
    const redis = new Redis({ url, token });
    _ratelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "60 s") });
    return _ratelimit;
  } catch (e) {
    console.error("[ratelimit init] failed", e);
    _ratelimit = null; return _ratelimit;
  }
}

// ---------- Tiny placeholder PDF renderer ----------
function escapePdfText(s: string) {
  // Escape parentheses and backslashes per PDF spec
  return s.replace(/([()\\])/g, "\\$1");
}

function tinyPdfFromText(msg: string): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  let offset = 0;

  const push = (s: string) => {
    const bytes = enc.encode(s);
    parts.push(bytes);
    offset += bytes.length;
  };

  // Collect object start offsets (xref)
  const xref: number[] = [];

  push("%PDF-1.4\n");

  const addObj = (num: number, body: string) => {
    xref[num] = offset;
    push(`${num} 0 obj\n${body}\nendobj\n`);
  };

  // 1: Catalog
  addObj(1, `<< /Type /Catalog /Pages 2 0 R >>`);

  // 2: Pages
  addObj(2, `<< /Type /Pages /Count 1 /Kids [3 0 R] >>`);

  // 4: Content stream (built before the Page dict so we know its ref)
  const text = `BT /F1 12 Tf 50 100 Td (${escapePdfText(msg)}) Tj ET`;
  const content = `<< /Length ${text.length} >>\nstream\n${text}\nendstream`;
  addObj(4, content);

  // 3: Page
  addObj(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`
  );

  // 5: Font
  addObj(5, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);

  // XRef
  const xrefStart = offset;
  let xrefTable = "xref\n0 6\n";
  xrefTable += "0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) {
    const pos = String(xref[i] ?? 0).padStart(10, "0");
    xrefTable += `${pos} 00000 n \n`;
  }
  push(xrefTable);

  // Trailer
  push(`trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  // Concatenate all parts
  const total = parts.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const b of parts) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}

export default async function handler(req: Request): Promise<Response> {
  const headers = commonHeaders(req);

  // Preflight
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return sendError(req, 405, "METHOD_NOT_ALLOWED", { msg: "POST required" });

  // Content type guard (expecting JSON input)
  const ctype = (req.headers.get("content-type") || "").toLowerCase();
  if (!ctype.startsWith("application/json")) {
    return sendError(req, 415, "UNSUPPORTED_MEDIA_TYPE", { msg: "Content-Type must be application/json" });
  }

  // Small payload cap
  const len = Number(req.headers.get("content-length") || 0);
  if (len && len > 10_000) return sendError(req, 413, "PAYLOAD_TOO_LARGE");

  // Rate limit
  const ratelimit = getRateLimiter();
  if (!ratelimit) {
    return sendError(req, 500, "INTERNAL_SERVER_ERROR", {
      msg: "Rate limiter unavailable (check UPSTASH_REDIS_REST_URL/_TOKEN)",
    });
  }

  try {
    // Parse body safely
    let rawBody: Record<string, unknown>;
    try {
      const rawText = await req.text();
      rawBody = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
    } catch (parseErr) {
      return sendError(req, 400, "BAD_REQUEST", { msg: "Invalid JSON body", err: parseErr });
    }

    // RL decision
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    const ua = req.headers.get("user-agent") || "";
    const key = `${ip}|${ua}`;
    const { success, limit, remaining, reset } = await ratelimit.limit(key);
    headers.set("X-RateLimit-Limit", String(limit));
    headers.set("X-RateLimit-Remaining", String(remaining));
    headers.set("X-RateLimit-Reset", String(reset));
    if (!success) return sendError(req, 429, "TOO_MANY_REQUESTS");

    // Validate
    const code = isRulesetCode(rawBody?.rulesetCode) ? (rawBody as any).rulesetCode : "CA-default";
    const schema = createSchemaForRuleset(code);
    const parsed = schema.safeParse(rawBody);
    if (!parsed.success) {
      return sendError(req, 400, "VALIDATION_ERROR", {
        msg: "Request failed input validation",
        extra: { issues: IS_DEV ? parsed.error.issues : undefined },
      });
    }

    // Compute canonically on server
    const result = computeResultsDynamic(parsed.data);

    // Render: for now, show a tiny message; later swap to real template renderer
    const message = `Mortgage PDF  payment=${result.payment.toFixed(2)}  n=${result.totalPayments}`;
    const bytes = tinyPdfFromText(message);

    // Disposition switch
    const url = new URL(req.url);
    const disp = (url.searchParams.get("disposition") || "inline").toLowerCase();
    const contentDisposition = disp === "attachment"
      ? 'attachment; filename="mortgage.pdf"'
      : 'inline; filename="mortgage.pdf"';

    // Stream
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(bytes); controller.close(); },
    });

    const pdfHeaders = new Headers(headers);
    pdfHeaders.set("Content-Type", "application/pdf");
    pdfHeaders.set("Content-Disposition", contentDisposition);
    pdfHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    pdfHeaders.set("Pragma", "no-cache");

    return new Response(stream, { status: 200, headers: pdfHeaders });
  } catch (err) {
    return sendError(req, 500, "INTERNAL_SERVER_ERROR", { msg: "Unhandled exception", err });
  }
}
