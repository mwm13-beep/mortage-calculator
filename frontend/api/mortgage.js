import { mortgageSchema } from "../shared/schemas/mortgageSchema.js";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "60 s"),
});

const ALLOW_ORIGIN = process.env.UI_ORIGIN;

export default async function handler(req, res) {
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

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  try {
    // ---- Method & content-type gates ----
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const ctype = req.headers["content-type"] || "";
    if (!ctype.toLowerCase().startsWith("application/json")) {
      return res.status(415).json({ error: "Content-Type must be application/json" });
    }

    // optional tiny size cap (helps avoid abuse when default body limits are raised)
    const len = Number(req.headers["content-length"] || 0);
    if (len && len > 10_000) {
      return res.status(413).json({ error: "Payload too large" });
    }

    // ---- Rate limit ----
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown";
    const key = `${ip}|${req.headers["user-agent"] ?? ""}`;

    const { success, limit, remaining, reset } = await ratelimit.limit(key);
    res.setHeader("X-RateLimit-Limit", limit.toString());
    res.setHeader("X-RateLimit-Remaining", remaining.toString());
    res.setHeader("X-RateLimit-Reset", reset.toString());

    if (!success) {
      return res.status(429).json({ error: "Too many requests, please try again later." });
    }

    // ---- Parse & validate ----
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const result = mortgageSchema.safeParse(body);

    if (!result.success) {
      if (process.env.NODE_ENV !== "production") {
        console.error("Validation error:", z.treeifyError(result.error));
      }
      // don’t echo detailed issues to clients in prod
      return res.status(400).json({ error: "Invalid input" });
    }

    const { loanAmount, downPayment = 0, rate, term } = result.data;

    const principal = loanAmount - downPayment;
    const monthlyRate = rate / 100 / 12;
    const numberOfPayments = term * 12;

    const payment =
      monthlyRate === 0
        ? principal / numberOfPayments
        : (principal * monthlyRate) /
          (1 - Math.pow(1 + monthlyRate, -numberOfPayments));

    // guard against weird FP artifacts like -0
    const cleanPayment = Object.is(payment, -0) ? 0 : payment;

    return res.status(200).json({ payment: cleanPayment });
  } catch (err) {
    // keep logs server-side; keep client error generic
    console.error("Backend error caught in /api/mortgage handler:", {
      message: err?.message,
      stack: err?.stack,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
}
