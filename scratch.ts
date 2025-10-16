import { computeResultsDynamic } from "./src/engine";

function within(actual: number, expected: number, tol = 0.01) {
  return Math.abs(actual - expected) <= tol;
}
function fail(msg: string) {
  console.error("❌", msg);
  process.exit(1);
}
function ok(msg: string) {
  console.log("✅", msg);
}

/** 1) Uninsured (>=20% down): no premium, cap 30 */
{
  const { result, derived } = computeResultsDynamic({
    rulesetCode: "CA-default",
    loanAmount: 600_000,
    downPayment: 150_000, // 25% down → uninsured
    rate: 5,
    term: 5,
    amortization: 40,     // should be capped at 30 (uninsured)
    firstTimeBuyer: false,
    newBuild: false,
  });

  console.log("uninsured", { result, derived });

  console.assert(derived.insured === false, "expected uninsured === false");
  console.assert(result.paymentsPerYear === 12, "paymentsPerYear should be 12");
  console.assert(result.totalPayments === 360, "amortization cap → 30 years * 12 = 360");

  // numeric checks (tolerances to avoid flakiness)
  if (!within(result.principal, 450_000)) fail("principal should be ~450,000");
  if (!within(result.payment, 2415.70, 0.02)) fail("payment should be ~2415.70");

  ok("uninsured scenario passed");
}

/** 2) Insured (<20% down): premium capitalized, cap 25 */
{
  const { result, derived } = computeResultsDynamic({
    rulesetCode: "CA-default",
    loanAmount: 600_000,
    downPayment: 60_000,   // 10% down → insured
    rate: 5,
    term: 5,
    amortization: 40,      // should be capped at 25 when insured
    firstTimeBuyer: false,
    newBuild: false,
  });

  console.log("insured", { result, derived });

  console.assert(derived.insured === true, "expected insured === true");
  console.assert(result.totalPayments === 300, "amortization cap → 25 years * 12 = 300");

  // With your bands + capitalization on, principal is ~558,600
  if (!within(result.principal, 558_600, 0.5)) fail("principal should be ~558,600");
  if (!within(result.payment, 3265.52, 0.02)) fail("payment should be ~3265.52");

  ok("insured scenario passed");
}

/** 3) Insured + first-time buyer + new build: cap 30 */
{
  const { result, derived } = computeResultsDynamic({
    rulesetCode: "CA-default",
    loanAmount: 600_000,
    downPayment: 60_000,   // insured
    rate: 5,
    term: 5,
    amortization: 40,      // FTB + new build → cap 30
    firstTimeBuyer: true,
    newBuild: true,
  });

  console.log("insured+ftb+new", { result, derived });

  console.assert(derived.insured === true, "expected insured === true");
  console.assert(result.totalPayments === 360, "FTB+new → cap 30 → 360 payments");

  // principal still ~558,600; payment lower than insured-25y case
  if (!within(result.principal, 558_600, 0.5)) fail("principal should be ~558,600");
  if (!within(result.payment, 2998.69, 0.02)) fail("payment should be ~2998.69");

  ok("insured + ftb + newBuild scenario passed");
}

console.log("\n🎉 All scratch checks passed!\n");
