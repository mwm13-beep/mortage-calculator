// src/engine/index.ts
import { RULESETS, type RulesetCode, isRulesetCode } from "../rulesets";
import { OutputOf } from "../schemas/schemaFactory";
import { nFromYearsFrequency, paymentFor } from "./formulas";
import type { EngineInput, EngineResult } from "./types";

export function computeResultsDynamic(input: OutputOf<RulesetCode>) {
  return computeResults(input as any);
}

function computeResults<C extends RulesetCode>(input: EngineInput<C>): EngineResult {
  const code = input.rulesetCode;

  if (!isRulesetCode(code)){
    throw new Error(`Unknown rulesetCode: ${String(code)}`);
  }
  
  // Look up the built ruleset (has roundingFns and optional plugin)
  const ruleset = RULESETS[code];
  const plugin = ruleset.plugin;

  // Allow a plugin to (a) compute derived flags and/or (b) tweak the input
  let derived: Record<string, unknown> = {};
  let effectiveInput = { ...input }; // will remain strongly typed for C at call sites

  if (plugin?.preCompute) {
    const out = plugin.preCompute(effectiveInput) || {};
    if (out.derived) derived = { ...derived, ...out.derived };
    if (out.input) effectiveInput = out.input as typeof effectiveInput;
  }

  // Base quantities (ruleset-agnostic)
  const paymentsPerYear = ruleset.paymentsPerYear;

  // Principal (before any CA capitalization, etc.)
  let principal = effectiveInput.loanAmount - effectiveInput.downPayment;

  // Let a plugin adjust principal (e.g., add CMHC premium when capitalized)
  if (plugin?.adjustPrincipal) {
    principal = plugin.adjustPrincipal(principal, effectiveInput, derived);
  }

  // Annual rate as entered
  const annualRatePercent = effectiveInput.rate;

  // Let a plugin cap amortization; otherwise use input as-is
  const amortizationYears = plugin?.capAmortization
    ? plugin.capAmortization(effectiveInput.amortization, effectiveInput, derived)
    : effectiveInput.amortization;

  // n and r using your helpers
  const totalPayments = nFromYearsFrequency(amortizationYears, paymentsPerYear);
  const periodicRate = ruleset.roundingFns.annualPctToPeriodicDecimal(annualRatePercent, paymentsPerYear);

  // Money rounding policy from ruleset
  const payment = paymentFor(
    principal,
    annualRatePercent,
    paymentsPerYear,
    input.amortization,
    ruleset.roundingFns,
  );

  // Assemble the result
  let result: EngineResult = {
    principal,
    annualRatePercent,
    periodicRateDecimal: periodicRate,
    paymentsPerYear,
    totalPayments,
    payment,
  };

  // Allow a plugin to post-process results (optional)
  if (plugin?.postCompute) {
    result = plugin.postCompute(result, effectiveInput, derived);
  }

  return result;
}
