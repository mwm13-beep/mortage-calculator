// api/mortgage.ts — Edge Function
export const config = { runtime: "edge" }; // <- tells Vercel to run this on Edge

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createSchemaForRuleset } from "../src/schemas/schemaFactory";
import { isRulesetCode } from "../src/rulesets";
import { IS_DEV, IS_PROD } from "./env";                // keep your env helpers if they’re pure
import { computeResultsDynamic } from "../src/engine";

// ---------- Types ----------
type ApiErrorCode =
  | "METHOD_NOT_ALLOWED"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "INVALID_PRINCIPAL"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_SERVER_ERROR";

// ---------- CORS / common headers ----------
const ALLOW_ORIGIN = process.env.UI_ORIGIN; // optional allowlist origin

function commonHeaders(req: Request): Headers {
  const h = new Headers();
  const origin = req.headers.get("origin");
  if (origin && ALLOW_ORIGIN && origin === ALLOW_ORIGIN) {
    h.set("Access-Control-Allow-Origin", origin);
    h.set("Vary", "Origin");
  }
  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  h.set("Content-Type", "application/json; charset=utf-8");
  h.set("Cache-Control", "no-store");
  return h;
}

// ---------- Correlation / errors ----------
function correlationId(req: Request): string {
  return (
    req.headers.get("x-vercel-id") ||
    req.headers.get("x-request-id") ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function devDetails(err: unknown) {
  if (!IS_DEV) return undefined;
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

function sendError(
  req: Request,
  httpStatus: number,
  code: ApiErrorCode,
  opts?: { msg?: string; extra?: Record<string, unknown>; err?: unknown }
): Response {
  const cid = correlationId(req);

  // Always log the raw error so Vercel Logs show it – even in prod
  if (opts?.err !== undefined) {
    console.error(`[${cid}] ${code}`, opts.msg ?? "", opts.err);
  } else {
    console.warn(`[${cid}] ${code}`, opts?.msg ?? "", IS_DEV ? opts?.extra ?? {} : undefined);
  }

  const headers = commonHeaders(req);
  headers.set("X-Correlation-Id", cid);

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

  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL || // Vercel KV names
    "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN || // must be WRITE token
    "";

  if (!url || !token) {
    console.warn("[ratelimit init] missing env", {
      hasUrl: !!url,
      hasToken: !!token,
      ve: process.env.VERCEL_ENV,
    });
    _ratelimit = null;
    return _ratelimit;
  }

  try {
    const redis = new Redis({ url, token });
    _ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "60 s"),
    });
    return _ratelimit;
  } catch (e) {
    console.error("[ratelimit init] failed", e);
    _ratelimit = null;
    return _ratelimit;
  }
}

// ---------- Handler (Edge) ----------
export default async function handler(req: Request): Promise<Response> {
  // quick env probe (remove later)
  if (new URL(req.url).searchParams.get("env") === "1") {
    const headers = commonHeaders(req);
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
    return new Response(
      JSON.stringify({
        vercelEnv: process.env.VERCEL_ENV,
        hasUrl: !!url,
        urlHost: url ? new URL(url).host : null,
        tokenLen: token.length,
      }),
      { status: 200, headers }
    );
  }

  const headers = commonHeaders(req);

  // Preflight
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return sendError(req, 405, "METHOD_NOT_ALLOWED", { msg: "POST required" });

  // Content type guard
  const ctype = (req.headers.get("content-type") || "").toLowerCase();
  if (!ctype.startsWith("application/json")) {
    return sendError(req, 415, "UNSUPPORTED_MEDIA_TYPE", { msg: "Content-Type must be application/json" });
  }

  // Optional small payload cap by header only
  const len = Number(req.headers.get("content-length") || 0);
  if (len && len > 10_000) return sendError(req, 413, "PAYLOAD_TOO_LARGE");

  // ---- Rate limiter presence (fail closed, but make it obvious in logs) ----
  const ratelimit = getRateLimiter();
  if (!ratelimit) {
    return sendError(req, 500, "INTERNAL_SERVER_ERROR", {
      msg: "Rate limiter unavailable (check UPSTASH_REDIS_REST_URL/_TOKEN)",
    });
  }

  try {
    // Safer JSON parse: handle empty body gracefully and log parse errors
    let rawBody: Record<string, unknown>;
    try {
      const text = await req.text();                     // read once
      rawBody = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch (parseErr) {
      return sendError(req, 400, "BAD_REQUEST", { msg: "Invalid JSON body", err: parseErr });
    }

    // Rate limit
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    const ua = req.headers.get("user-agent") || "";
    const key = `${ip}|${ua}`;
    const { success, limit, remaining, reset } = await ratelimit.limit(key);
    headers.set("X-RateLimit-Limit", String(limit));
    headers.set("X-RateLimit-Remaining", String(remaining));
    headers.set("X-RateLimit-Reset", String(reset));
    if (!success) return sendError(req, 429, "TOO_MANY_REQUESTS");

    // Validate & compute
    const codeMaybe = rawBody["rulesetCode"];
    const code = isRulesetCode(codeMaybe) ? codeMaybe : "CA-default";
    const schema = createSchemaForRuleset(code);
    const validated = schema.safeParse(rawBody);

    if (!validated.success) {
      return sendError(req, 400, "VALIDATION_ERROR", {
        msg: "Request failed input validation",
        extra: { issues: IS_DEV ? validated.error.issues : undefined },
      });
    }

    const result = computeResultsDynamic(validated.data);
    headers.set("Cache-Control", "no-store");
    return new Response(JSON.stringify(result), { status: 200, headers });

  } catch (err) {
    return sendError(req, 500, "INTERNAL_SERVER_ERROR", { msg: "Unhandled exception", err });
  }

}
