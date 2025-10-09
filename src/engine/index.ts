// src/engine/index.ts
import { RULESETS, type RulesetCode, isRulesetCode } from "../rulesets";
import type { EngineInput, EngineResult } from "./types";
import { nFromYearsFrequency, periodicRateDecimal, paymentFor } from "./formulas";

/** Main entry point for both client and server */
export function computeResults<C extends RulesetCode>(input: EngineInput<C>): EngineResult {
  const code = input.rulesetCode;

  if (!isRulesetCode(code)){
    throw new Error(`Unknown rulesetCode: ${String(code)}`);
  }
  
  const ruleset = RULESETS[code];

  // Jurisdiction-derived context (e.g., insured for CA). No CA logic here.
  // const derived = ruleset.deriveCtx(input as any); // May end up using this later for PDF breakdown

  // Base quantities (ruleset-agnostic)
  const paymentsPerYear = ruleset.paymentsPerYear;

  // Principal: for v1 this is simply loan - DP (CMHC capitalization comes later in a CA-specific engine step)
  const principal = input.loanAmount - input.downPayment;

  const annualRatePercent = input.rate;
  const totalPayments = nFromYearsFrequency(input.amortization, paymentsPerYear);
  const periodicRate = periodicRateDecimal(annualRatePercent, paymentsPerYear);

  // Money rounding policy from ruleset
  const payment = paymentFor(
    principal,
    annualRatePercent,
    paymentsPerYear,
    input.amortization,
    ruleset.rounding
  );

  return {
    principal,
    annualRatePercent,
    periodicRateDecimal: periodicRate,
    paymentsPerYear,
    totalPayments,
    payment,
  };
}
