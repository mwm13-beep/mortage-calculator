// src/engine/rounding.ts
import { roundTo } from "../domain/numberFormats";
import type { RoundingPolicy } from "../rulesets/types";

export function makeRounding(policy: RoundingPolicy) {
  const money = (v: number) =>
    roundTo(v, policy.moneyDecimals, policy.moneyMode);
  const ratePct = (v: number) =>
    roundTo(v, policy.rateDecimals, policy.rateMode);

  const annualPctToPeriodicDecimal = (annualPct: number, paymentsPerYear: number) =>
    (annualPct / 100) / paymentsPerYear;

  return { money, ratePct, annualPctToPeriodicDecimal };
}
