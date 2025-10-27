// tests/e2e/api.spec.ts
import { describe, it, expect } from "vitest";
import "undici";

const APP = (process.env.APP_URL ?? "").replace(/\/+$/, "");
if (!APP) console.warn("Set APP_URL to run e2e tests");

// allow overriding in CI or locally
const BUDGET_MS = Number(process.env.E2E_BUDGET_MS ?? 2500);
const WARMUP    = Number(process.env.E2E_WARMUP ?? 1);   // how many warm-ups before timing
const RUNS      = Number(process.env.E2E_RUNS ?? 2);     // how many timed runs (avg/p95)

const valid = {
  rulesetCode: "CA-Default",
  loanAmount: 500000, downPayment: 100000,
  rate: 5.25, term: 5, amortization: 25,
  firstTimeBuyer: false, newBuild: false,
};

function elapsed(t0: number) { return Date.now() - t0; }

async function timedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const t0 = Date.now();
  const resp = await fetch(input, { redirect: "follow", ...init });
  const rtt = elapsed(t0);
  // prefer server-reported time if present
  const hdr = resp.headers.get("x-duration-ms") || resp.headers.get("server-timing"); // optional
  const serverMs = hdr && /^\d+(\.\d+)?$/.test(hdr) ? Number(hdr) : undefined;
  return { resp, rtt, serverMs };
}

async function runWithWarmup(url: string, init: RequestInit) {
  // warm-up calls (ignored)
  for (let i = 0; i < WARMUP; i++) await fetch(url, { redirect: "follow", ...init });

  const samples: { rtt: number; server?: number }[] = [];
  for (let i = 0; i < RUNS; i++) {
    const { resp, rtt, serverMs } = await timedFetch(url, init);
    expect(resp.status).toBe(200);
    samples.push({ rtt, server: serverMs });
  }
  // p95-ish with small N: use max of the timed runs; or compute avg if you prefer
  const rttMax = Math.max(...samples.map(s => s.rtt));
  const serverCandidates = samples.map(s => s.server).filter((n): n is number => Number.isFinite(n));
  const serverMax = serverCandidates.length ? Math.max(...serverCandidates) : undefined;

  return { rttMax, serverMax };
}

(APP ? describe : describe.skip)("e2e:api", () => {
  it("mortgage: JSON happy path under budget, secure headers", async () => {
    const url = `${APP}/api/mortgage`;
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(valid),
    };

    const { resp } = await timedFetch(url, init); // one call to get headers for assertions
    expect(resp.headers.get("content-type") ?? "").toContain("application/json");
    expect(resp.headers.get("cache-control") ?? "").toContain("no-store");
    expect(resp.headers.get("x-correlation-id")).toBeTruthy();
    const json: any = await resp.json();
    expect(json.error).toBeUndefined();
    expect(typeof json.payment).toBe("number");
    expect(json.breakdown?.paymentsPerYear).toBe(12);

    // performance check using warmup + multiple runs
    const { rttMax, serverMax } = await runWithWarmup(url, init);
    // Prefer server time if you add X-Duration-MS for mortgage.ts too
    if (serverMax !== undefined) {
      expect(serverMax).toBeLessThan(BUDGET_MS);     // server processing budget
    } else {
      expect(rttMax).toBeLessThan(BUDGET_MS);        // fallback to RTT
    }
  });

  it("pdf inline: bytes + headers under budget", async () => {
    const url = `${APP}/api/pdf?disposition=inline`;
    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/pdf" },
      body: JSON.stringify(valid),
    };

    const first = await timedFetch(url, init);
    const resp = first.resp;
    expect(resp.headers.get("content-type") ?? "").toContain("application/pdf");
    expect(resp.headers.get("content-disposition") ?? "").toContain("inline");
    expect(resp.headers.get("cache-control") ?? "").toContain("no-store");
    expect(resp.headers.get("pragma") ?? "").toContain("no-cache");
    expect(resp.headers.get("x-correlation-id")).toBeTruthy();
    const buf = await resp.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(100);

    const { rttMax, serverMax } = await runWithWarmup(url, init);
    // pdf.ts already sets X-Duration-MS
    if (serverMax !== undefined) {
      expect(serverMax).toBeLessThan(BUDGET_MS);
    } else {
      expect(rttMax).toBeLessThan(BUDGET_MS);
    }
  });
});
