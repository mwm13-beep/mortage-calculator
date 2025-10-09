// src/engine/types.ts
import type { RulesetCode } from "../rulesets";
import type { InputOf, OutputOf } from "../schemas/schemaFactory";

// What the engine accepts (already validated & rounded by the schema)
export type EngineInput<C extends RulesetCode = RulesetCode> = OutputOf<C>;

// Minimal, stable result shape every ruleset must return
export type EngineResult = {
  // canonical numbers the UI/API can display or feed into PDFs
  principal: number;           // after DP (and later CMHC capitalization if applicable)
  annualRatePercent: number;   // sanitized percent
  periodicRateDecimal: number; // r = annual / paymentsPerYear
  paymentsPerYear: number;     // e.g. 12
  totalPayments: number;       // n
  payment: number;             // periodic payment (rounded by money policy)
};

// Helper so callers can get the *input* type for a given ruleset at compile time
export type InputFor<C extends RulesetCode> = InputOf<C>;
