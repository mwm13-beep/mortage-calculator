import { RoundingFns } from "../rulesets/types";

export function nFromYearsFrequency(years: number, paymentsPerYear: number): number {
  return Math.round(years * paymentsPerYear);
}

/** Standard annuity payment; r=0 handled; money rounding applied at the end */
export function paymentFor(
  principal: number,
  annualRatePercent: number,
  paymentsPerYear: number,
  years: number,
  roundingFns: RoundingFns,
): number {
  const n = nFromYearsFrequency(years, paymentsPerYear);
  const r = roundingFns.annualPctToPeriodicDecimal(annualRatePercent, paymentsPerYear);

  let pmt: number;
  if (r === 0) {
    pmt = principal / n;
  } else {
    const pow = Math.pow(1 + r, -n);
    pmt = principal * r / (1 - pow);
  }
  
  // Apply money rounding policy at the end (e.g., 2 decimals, half-up/bankers)
  return roundingFns.money(pmt);
}