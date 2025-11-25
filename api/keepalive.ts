// api/keepalive.ts
export const config = { runtime: "edge" };

import { Redis } from "@upstash/redis";
import { baseHeaders, sendError } from "./_util/http";

const url   = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL!;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN!;

export default async function handler(req: Request) {
  const headers = baseHeaders(req, "application/json; charset=utf-8");

  // allow only POST (and preflight)
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST" && req.method !== "GET") return sendError(req, 405, "METHOD_NOT_ALLOWED", { msg: "POST required" });

  // simple bearer auth (server-to-server cron)
  const auth = req.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return sendError(req, 401, "INVALID_PRINCIPAL", { msg: "Unauthorized" });
  }

  try {
    const redis = new Redis({ url, token });
    const now = new Date();
    const timestamp = now.toISOString();

    // Latest heartbeat (for quick check)
    await redis.set("heartbeat:last", timestamp, { ex: 60 * 60 * 24 * 10 });

    // Rolling history (each run gets its own key)
    await redis.set(`heartbeat:${timestamp}`, "ok", {
      ex: 60 * 60 * 24 * 10, // 10 days
    });

    return new Response(null, { status: 204, headers });
  } catch (e) {
    console.error("keepalive error", e);
    return sendError(req, 500, "KEEPALIVE_FAILED", { msg: "Redis ping failed" });
  }
}
