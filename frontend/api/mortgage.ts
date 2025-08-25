// frontend/api/mortgage.ts
import type { VercelRequest, VercelResponse } from "./vercel-types";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { createMortgageSchema, type JurisdictionCtx } from "../src/schemas/mortgageSchemaFactory";
import { toCents, fromCents, toMilliPercent } from "../src/domain/numberFormats";

// ---- Upstash rate limit ----
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "60 s"),
});

const ALLOW_ORIGIN = process.env.UI_ORIGIN;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ---- CORS / preflight ----
  const origin = req.headers.origin;
  if (origin && ALLOW_ORIGIN && origin === ALLOW_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    // ---- Method & content-type gates ----
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ctype = String(req.headers["content-type"] || "");
    if (!ctype.toLowerCase().startsWith("application/json")) {
      return res.status(415).json({ error: "Content-Type must be application/json" });
    }

    // Optional tiny size cap
    const len = Number(req.headers["content-length"] || 0);
    if (len && len > 10_000) {
      return res.status(413).json({ error: "Payload too large" });
    }

    // ---- Rate limit ----
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
      return res.status(429).json({ error: "Too many requests, please try again later." });
    }

    // ---- Parse & validate via schema factory ----
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;

    // Derive minimal context from raw values (insured affects max amortization).
    // If you later add explicit flags to the payload, read them here instead.
    const loanRaw = Number(body.loanAmount ?? 0);
    const dpRaw = Number(body.downPayment ?? 0);
    const insured = loanRaw > 0 ? dpRaw / loanRaw < 0.20 : false;

    const ctx: JurisdictionCtx = {
      code: "CA-default",
      insured,
      firstTimeBuyer: false,
      newBuild: false,
    };

    const schema = createMortgageSchema(ctx);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Validation error:", parsed.error.issues);
      }
      return res.status(400).json({ error: "Invalid input" });
    }

    const { loanAmount, downPayment = 0, rate, amortization } = parsed.data;

    // ---- Normalize for stable math (belt & suspenders) ----
    const principalCents = toCents(loanAmount) - toCents(downPayment);
    if (principalCents <= 0) {
      return res.status(400).json({ error: "Invalid principal" });
    }

    // Rate as milli-percent → monthly decimal rate
    const rMilli = toMilliPercent(rate); // e.g., 5.125% -> 5125
    const monthlyRate = rMilli / 1_200_000; // 1000 * 100 * 12

    const n = Math.max(1, Math.trunc(Number(amortization) * 12)); // total number of payments
    const principal = fromCents(principalCents);

    // ---- Payment calculation uses AMORTIZATION (not term) ----
    const payment =
      monthlyRate === 0
        ? principal / n
        : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));

    const cleanPayment = Object.is(payment, -0) ? 0 : payment;

    // Optional: include fields useful to the client (e.g., amortization)
    return res.status(200).json({
      payment: cleanPayment,
      amortizationYears: amortization,
      // contractTermYears: parsed.data.term, // keep term available if you want to display it
    });
  } catch (err: any) {
    console.error("Backend error caught in /api/mortgage handler:", {
      message: err?.message,
      stack: err?.stack,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
}
