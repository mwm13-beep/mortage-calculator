// src/engine/formulas.ts
import { roundTo } from "../domain/numberFormats"; // reuse your deterministic rounding
import type { RoundingPolicy } from "../rulesets/types";

/** total number of payments for term/amortization (years * paymentsPerYear) */
export function nFromYearsFrequency(years: number, paymentsPerYear: number): number {
  return Math.round(years * paymentsPerYear);
}

/** periodic (per-payment) rate from annual percent */
export function periodicRateDecimal(annualRatePercent: number, paymentsPerYear: number): number {
  return (annualRatePercent / 100) / paymentsPerYear;
}

/** Standard annuity payment; r=0 handled; money rounding applied at the end */
export function paymentFor(
  principal: number,
  annualRatePercent: number,
  paymentsPerYear: number,
  years: number,
  rounding: RoundingPolicy
): number {
  const n = nFromYearsFrequency(years, paymentsPerYear);
  const r = periodicRateDecimal(annualRatePercent, paymentsPerYear);

  let pmt: number;
  if (r === 0) {
    pmt = principal / n;
  } else {
    const pow = Math.pow(1 + r, -n);
    pmt = principal * r / (1 - pow);
  }

  // Apply money rounding policy at the end (e.g., 2 decimals, half-up/bankers)
  return roundTo(pmt, rounding.moneyDecimals, rounding.moneyMode);
}
