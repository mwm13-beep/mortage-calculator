// src/engine/index.ts
import { RULESETS, type RulesetCode, isRulesetCode } from "../rulesets";
import { OutputOf } from "../schemas/schemaFactory";
import { nFromYearsFrequency, paymentFor } from "./formulas";
import type { EngineInput, EngineResult } from "./types";

export function computeResultsDynamic(input: OutputOf<RulesetCode>) {
  return computeWithDerived(input as any); // returns { result, derived }
}

export function computeWithDerived<C extends RulesetCode>(
  input: EngineInput<C>
): { result: EngineResult; derived: Record<string, unknown> } {
  const code = input.rulesetCode;
  if (!isRulesetCode(code)) throw new Error(`Unknown rulesetCode: ${String(code)}`);

  const ruleset = RULESETS[code];
  const plugin = ruleset.plugin;

  let derived: Record<string, unknown> = {};
  let effectiveInput = { ...input };

  if (plugin?.preCompute) {
    const out = plugin.preCompute(effectiveInput) || {};
    if (out.derived) derived = { ...derived, ...out.derived };
    if (out.input) effectiveInput = out.input as typeof effectiveInput;
  }

  const paymentsPerYear = ruleset.paymentsPerYear;

  let principal = effectiveInput.loanAmount - effectiveInput.downPayment;
  if (plugin?.adjustPrincipal) {
    principal = plugin.adjustPrincipal(principal, effectiveInput, derived);
  }

  const annualRatePercent = effectiveInput.rate;

  const amortizationYears = plugin?.capAmortization
    ? plugin.capAmortization(effectiveInput.amortization, effectiveInput, derived)
    : effectiveInput.amortization;

  const totalPayments = nFromYearsFrequency(amortizationYears, paymentsPerYear);
  const periodicRate = ruleset.roundingFns.annualPctToPeriodicDecimal(annualRatePercent, paymentsPerYear);

  // ✅ Use the *capped* amortizationYears for paymentFor, not input.amortization
  const payment = paymentFor(
    principal,
    annualRatePercent,
    paymentsPerYear,
    amortizationYears,
    ruleset.roundingFns,
  );

  let result: EngineResult = {
    principal,
    annualRatePercent,
    periodicRateDecimal: periodicRate,
    paymentsPerYear,
    totalPayments,
    payment,
  };

  if (plugin?.postCompute) {
    result = plugin.postCompute(result, effectiveInput, derived);
  }

  return { result, derived };
}
