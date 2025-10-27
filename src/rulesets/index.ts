import { caDefault } from "./ca";

export const RULESETS = {
  "CA-Default": caDefault,
} as const;

export type RulesetCode = keyof typeof RULESETS;
export const isRulesetCode = (v: unknown): v is RulesetCode =>
  typeof v === "string" && v in RULESETS;

export type AnyBuiltRuleset = typeof RULESETS[RulesetCode];
