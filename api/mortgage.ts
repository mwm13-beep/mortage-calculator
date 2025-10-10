// frontend/api/mortgage.ts
if (process.env.FN_INSPECT === '1') {
  try {
    const inspector = await import('node:inspector');
    if (inspector.open(9231, '127.0.0.1', true)) {
      console.log('Debugger is ready');
    }
  } catch {}
}

import type { VercelRequest, VercelResponse } from "./vercel-types";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { createSchemaForRuleset } from "../src/schemas/schemaFactory";
import { isRulesetCode } from "../src/rulesets";
import { IS_DEV, IS_PROD } from "./env";
import { computeResultsDynamic } from "../src/engine";

/** ------------------------------------------------------------------ */
/** Error helpers                                                       */
/** ------------------------------------------------------------------ */

type ApiErrorCode =
  | "METHOD_NOT_ALLOWED"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "INVALID_PRINCIPAL"
  | "TOO_MANY_REQUESTS"
  | "INTERNAL_SERVER_ERROR";

function correlationId(req: VercelRequest) {
  return (
    (req.headers["x-vercel-id"] as string | undefined) ||
    (req.headers["x-request-id"] as string | undefined) ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function devDetails(err: unknown) {
  if (!IS_DEV) return undefined;
  const base =
    err instanceof Error
      ? { message: err.message, name: err.name, stack: err.stack }
      : { message: String(err) };
  return base;
}

function sendError(
  req: VercelRequest,
  res: VercelResponse,
  httpStatus: number,
  code: ApiErrorCode,
  opts?: { msg?: string; extra?: Record<string, unknown>; err?: unknown }
) {
  const cid = correlationId(req);
  // Always log internally (prod or dev)
  if (opts?.err) {
    console.error(`[${cid}] ${code}`, opts.msg ?? "", devDetails(opts.err));
  } else {
    console.warn(`[${cid}] ${code}`, opts?.msg ?? "", IS_DEV ? opts?.extra ?? {} : undefined);
  }

  // In prod, 500s are always generic
  if (IS_PROD && httpStatus >= 500) {
    res.setHeader("X-Correlation-Id", cid);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" as const });
  }

  const body: Record<string, unknown> = { error: code };
  if (opts?.msg && IS_DEV) body.message = opts.msg;
  if (opts?.extra && IS_DEV) body.details = opts.extra;
  if (opts?.err && IS_DEV) body.errorObject = devDetails(opts.err);
  body.correlationId = cid; // safe to expose

  return res.status(httpStatus).json(body);
}

/** ------------------------------------------------------------------ */
/** CORS / headers                                                      */
/** ------------------------------------------------------------------ */

const ALLOW_ORIGIN = process.env.UI_ORIGIN; // optional explicit allowlist origin

function setCommonHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin;
  if (origin && ALLOW_ORIGIN && origin === ALLOW_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
}

/** ------------------------------------------------------------------ */
/** Rate limit (strict—no dev bypass)                                  */
/** ------------------------------------------------------------------ */

let ratelimit: Ratelimit | null = null;
try {
  // If misconfigured this will throw and be handled in the request
  ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(10, "60 s"),
  });
} catch (e) {
  // Defer to request-time handling so we can respond with correlation id, etc.
  ratelimit = null;
}

/** ------------------------------------------------------------------ */
/** Handler                                                             */
/** ------------------------------------------------------------------ */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCommonHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return sendError(req, res, 405, "METHOD_NOT_ALLOWED", { msg: "POST required" });
  }

  const ctype = String(req.headers["content-type"] || "");
  if (!ctype.toLowerCase().startsWith("application/json")) {
    return sendError(req, res, 415, "UNSUPPORTED_MEDIA_TYPE", {
      msg: "Content-Type must be application/json",
    });
  }

  const len = Number(req.headers["content-length"] || 0);
  if (len && len > 10_000) {
    return sendError(req, res, 413, "PAYLOAD_TOO_LARGE");
  }

  try {
    // --- Rate limit (fail closed) ---
    if (!ratelimit) {
      // Misconfiguration or init error from module load
      return sendError(req, res, 500, "INTERNAL_SERVER_ERROR", {
        msg: "Rate limiter unavailable",
      });
    }
    const ip =
      (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown";
    const key = `${ip}|${req.headers["user-agent"] ?? ""}`;
    const { success, limit, remaining, reset } = await ratelimit.limit(key);
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(reset));

    if (!success) {
      return sendError(req, res, 429, "TOO_MANY_REQUESTS");
    }

    // ---- Parse/validate with dynamic context ----
    const rawBody = (req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {}) || {};
    const codeMaybe = rawBody["rulesetCode"];
    const code = isRulesetCode(codeMaybe) ? codeMaybe : "CA-default"; // fallback but still validated
    const schema = createSchemaForRuleset(code);
    const validated = schema.safeParse(rawBody);

    if (!validated.success) {
      return sendError(req, res, 400, "VALIDATION_ERROR", {
        msg: "Request failed input validation",
        extra: { issues: IS_DEV ? validated.error.issues : undefined },
      });
    }

    const result = computeResultsDynamic(validated.data);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(result);
  } catch (err) {
    // Unknown/unexpected failure: log + generic 500 in prod, rich info in dev
    return sendError(req, res, 500, "INTERNAL_SERVER_ERROR", {
      msg: "Unhandled exception",
      err,
    });
  }
}
