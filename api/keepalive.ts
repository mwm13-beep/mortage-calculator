// api/keepalive.ts
export const config = { runtime: "edge" };

import { Redis } from "@upstash/redis";

// If you mapped your vars to UPSTASH_* keep this:
const url   = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL!;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN!;

export default async function handler(req: Request) {
    const auth = req.headers.get("authorization") || "";

    if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response("Unauthorized", { status: 401 });
    }

    try {
        const redis = new Redis({ url, token });

        // any tiny write or ping works; this both "touches" and gives you a breadcrumb
        await redis.set("heartbeat", Date.now().toString(), { ex: 60 * 60 * 24 * 21 }); // 21-day TTL
        await redis.ping();

        return new Response(null, {
            status: 204,
            headers: { "Cache-Control": "no-store" },
        });
        } catch {
        // even if it fails, respond 204 so the cron isn’t noisy
        return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    }
}
