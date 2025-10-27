// src/engine/index.ts
import { RULESETS, type RulesetCode, isRulesetCode } from "../rulesets";
import { DerivedFor } from "../schemas/derived";
import { OutputOf } from "../schemas/requestFactory";
import { nFromYearsFrequency, paymentFor } from "./formulas";
import type { EngineInput, EngineResult } from "./types";

export function computeResultsDynamic<C extends RulesetCode>(
  input: OutputOf<C>
): EngineResult<DerivedFor<C>> {
  return computeWithDerived(input as any) as EngineResult<DerivedFor<C>>;
}

export function computeWithDerived<C extends RulesetCode>(input: OutputOf<C>): EngineResult<DerivedFor<C>> {
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
    derived
  };

  if (plugin?.postCompute) {
    result = plugin.postCompute(result, effectiveInput, derived);
  }

  return result as EngineResult<DerivedFor<C>>;
}
