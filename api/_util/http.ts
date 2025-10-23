// api/_util/http.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { IS_DEV, IS_PROD } from "../env";

export type ApiErrorCode =
  | "METHOD_NOT_ALLOWED" | "UNSUPPORTED_MEDIA_TYPE" | "PAYLOAD_TOO_LARGE" | "BAD_REQUEST"
  | "VALIDATION_ERROR" | "INVALID_PRINCIPAL" | "TOO_MANY_REQUESTS" | "INTERNAL_SERVER_ERROR";

const ALLOW_ORIGIN = process.env.UI_ORIGIN;

// --- headers / CORS
export function baseHeaders(req: Request, contentType?: string): Headers {
  const h = new Headers();
  const origin = req.headers.get("origin");
  if (origin && ALLOW_ORIGIN && origin === ALLOW_ORIGIN) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
  }
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization");
  h.set("Cache-Control", "no-store");
  if (contentType) h.set("Content-Type", contentType);
  return h;
}

export function correlationId(req: Request): string {
  return (
    req.headers.get("x-vercel-id") ||
    req.headers.get("x-request-id") ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function devDetails(err: unknown) {
  if (!IS_DEV) return undefined;
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return { message: String(err) };
}

export function sendError(
  req: Request,
  httpStatus: number,
  code: ApiErrorCode,
  opts?: { msg?: string; extra?: Record<string, unknown>; err?: unknown }
): Response {
  const cid = correlationId(req);
  const headers = baseHeaders(req, "application/json; charset=utf-8");
  headers.set("X-Correlation-Id", cid);

  if (opts?.err) console.error(`[${cid}] ${code}`, opts.msg ?? "", opts.err);
  else console.warn(`[${cid}] ${code}`, opts?.msg ?? "", IS_DEV ? opts?.extra ?? {} : undefined);

  if (IS_PROD && httpStatus >= 500) {
    return new Response(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }), { status: 500, headers });
  }
  const body: Record<string, unknown> = { error: code, correlationId: cid };
  if (opts?.msg && IS_DEV) body.message = opts.msg;
  if (opts?.extra && IS_DEV) body.details = opts.extra;
  if (opts?.err && IS_DEV) body.errorObject = devDetails(opts.err);

  return new Response(JSON.stringify(body), { status: httpStatus, headers });
}

// --- method / preflight
export function guardMethod(req: Request, headers: Headers, method = "POST"): Response | null {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== method) return sendError(req, 405, "METHOD_NOT_ALLOWED", { msg: `${method} required` });
  return null;
}

// --- content-type + size guard
export function guardJson(req: Request): Response | null {
  const ctype = (req.headers.get("content-type") || "").toLowerCase();
  if (!ctype.startsWith("application/json")) {
    return sendError(req, 415, "UNSUPPORTED_MEDIA_TYPE", { msg: "Content-Type must be application/json" });
  }
  const len = Number(req.headers.get("content-length") || 0);
  if (len && len > 10_000) return sendError(req, 413, "PAYLOAD_TOO_LARGE");
  return null;
}

export async function parseJsonBody(req: Request) {
  try {
    const raw = await req.text();
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch (e) {
    throw { http: 400, code: "BAD_REQUEST", err: e, msg: "Invalid JSON body" } as const;
  }
}

// --- rate limit singleton + check
let _ratelimit: Ratelimit | null | undefined;
export function getRateLimiter(): Ratelimit | null {
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

export async function applyRateLimit(req: Request, headers: Headers): Promise<Response | null> {
  const rl = getRateLimiter();
  if (!rl) return sendError(req, 500, "INTERNAL_SERVER_ERROR", { msg: "Rate limiter unavailable" });
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const ua = req.headers.get("user-agent") || "";
  const key = `${ip}|${ua}`;
  const { success, limit, remaining, reset } = await rl.limit(key);
  headers.set("X-RateLimit-Limit", String(limit));
  headers.set("X-RateLimit-Remaining", String(remaining));
  headers.set("X-RateLimit-Reset", String(reset));
  if (!success) return sendError(req, 429, "TOO_MANY_REQUESTS");
  return null;
}
