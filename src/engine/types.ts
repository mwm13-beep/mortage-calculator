// src/engine/types.ts
import type { RulesetCode } from "../rulesets";
import type { InputOf, OutputOf } from "../schemas/requestFactory";

// What the engine accepts (already validated & rounded by the schema)
export type EngineInput<C extends RulesetCode = RulesetCode> = OutputOf<C>;

export type EngineResult<D = Record<string, unknown>> = {
  principal: number;
  annualRatePercent: number;
  periodicRateDecimal: number;
  paymentsPerYear: number;
  totalPayments: number;
  payment: number;
  derived: D;
};

// Helper so callers can get the *input* type for a given ruleset at compile time
export type InputFor<C extends RulesetCode> = InputOf<C>;
