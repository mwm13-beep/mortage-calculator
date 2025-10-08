import type { z } from "zod";

export type RoundingMode = "half-up" | "bankers";

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

export type RulesetShape<E extends z.ZodObject<any> = z.ZodObject<any>> = {
  code: string;
  currency: string;
  paymentsPerYear: number;
  loanBounds: { min: number; max: number };
  rateBounds: { min: number; max: number };
  termBoundsYears: { min: number; max: number };
  rounding: RoundingPolicy;

  /** Extra user inputs for this ruleset (or z.object({}) if none) */
  extrasSchema: E;

  /** Compute derived context used by rules (e.g., insured in CA) */
  deriveCtx: (i: BaseInput & z.infer<E>) => Record<string, unknown>;

  /** Max amortization based on derived ctx + extras */
  maxAmortizationYears: (i: BaseInput & z.infer<E>) => number;
};
