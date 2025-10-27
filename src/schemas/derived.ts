import type { RulesetCode } from "../rulesets";

export type DerivedMap = {
  "CA-Default": { insured: boolean };
  // Add other jurisdictions here as you introduce them…
};

export type DerivedFor<C extends RulesetCode> =
  C extends keyof DerivedMap ? DerivedMap[C] : Record<string, unknown>;
