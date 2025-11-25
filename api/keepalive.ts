// api/keepalive.ts
export const config = { runtime: "edge" };

import { Redis } from "@upstash/redis";
import { baseHeaders, sendError, ApiErrorCode } from "./_util/http";

const url   = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL!;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN!;

export default async function handler(req: Request) {
  const headers = baseHeaders(req, "application/json; charset=utf-8");

  // allow only POST (and preflight)
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return sendError(req, 405, "METHOD_NOT_ALLOWED", { msg: "POST required" });

  // simple bearer auth (server-to-server cron)
  const auth = req.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return sendError(req, 401, "INVALID_PRINCIPAL", { msg: "Unauthorized" });
  }

  try {
    const redis = new Redis({ url, token });
    await redis.set("heartbeat", Date.now().toString(), { ex: 60 * 60 * 24 * 21 });
    await redis.ping();
    return new Response(null, { status: 204, headers });
  } catch (e) {
    console.error("keepalive error", e);
    return sendError(req, 500, "KEEPALIVE_FAILED", { msg: "Redis ping failed" });
  }
}
