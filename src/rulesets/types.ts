import type { z } from "zod";
import { RoundingMode } from "../engine/rounding"

export type RoundingPolicy = {
  moneyDecimals: number;   // e.g., 2
  moneyMode: RoundingMode; // e.g., "half-up"
  rateDecimals: number;    // e.g., 3
  rateMode: RoundingMode;  // e.g., "half-up"
};

export type BaseInput = {
  loanAmount: number;
  downPayment: number;
  rate: number;
  term: number;           // years
  amortization: number;   // years
};

export type RulesetShape<
  E extends z.ZodObject<any> = z.ZodObject<any>,
  > = {
  code: string;
  currency: string;
  paymentsPerYear: number;
  loanBounds: { min: number; max: number };
  rateBounds: { min: number; max: number };
  termBoundsYears: { min: number; max: number };
  rounding: RoundingPolicy;
  extrasSchema: E;
};

export type RoundingFns = {
  money: (v: number) => number;
  ratePct: (v: number) => number;
  annualPctToPeriodicDecimal: (annualPct: number, paymentsPerYear: number) => number;
};

export type BuiltRuleset<E extends z.ZodObject<any> = z.ZodObject<any>> =
  RulesetShape<E> & { 
    roundingFns: RoundingFns,
    plugin?: AnyRulesetPlugin,
  };

export type RulesetPlugin<Input, Result> = Partial<{
  preCompute: (i: Input) => { derived?: Record<string, unknown>, input?: Input };
  adjustPrincipal: (principal: number, i: Input, derived: Record<string, unknown>) => number;
  capAmortization: (years: number, i: Input, derived: Record<string, unknown>) => number;
  postCompute: (r: Result, i: Input, derived: Record<string, unknown>) => Result;
}>;

export type AnyRulesetPlugin = RulesetPlugin<any, any>;
