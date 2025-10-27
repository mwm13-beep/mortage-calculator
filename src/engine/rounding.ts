// src/engine/rounding.ts
import Decimal from "decimal.js";
import type { RoundingPolicy } from "../rulesets/types";

export type RoundingMode = "half-up" | "bankers";

const MODE: Record<RoundingMode, Decimal.Rounding> = {
  "half-up": Decimal.ROUND_HALF_UP,
  "bankers": Decimal.ROUND_HALF_EVEN,
};

// INTERNAL: do not export
function roundTo(value: number, decimals: number, mode: RoundingMode): number {
  return new Decimal(value).toDecimalPlaces(decimals, MODE[mode]).toNumber();
}

// INTERNAL: do not export
function annualPctToPeriodicDecimalRaw(annualPct: number, paymentsPerYear: number): number {
  return new Decimal(annualPct).div(100).div(paymentsPerYear).toNumber();
}

// PUBLIC: the only thing other code should import
export function makeRounding(policy: RoundingPolicy) {
  const money   = (v: number) => roundTo(v, policy.moneyDecimals, policy.moneyMode);
  const ratePct = (v: number) => roundTo(v, policy.rateDecimals,  policy.rateMode);
  const annualPctToPeriodicDecimal = (annualPct: number, paymentsPerYear: number) =>
    annualPctToPeriodicDecimalRaw(annualPct, paymentsPerYear);

  return { money, ratePct, annualPctToPeriodicDecimal };
}
