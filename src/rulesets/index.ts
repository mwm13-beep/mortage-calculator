import { caDefault } from "./ca"; // you’ll add in Task 2

export const RULESETS = {
  "CA-default": caDefault,
} as const;

export type RulesetCode = keyof typeof RULESETS;
export const isRulesetCode = (v: unknown): v is RulesetCode =>
  typeof v === "string" && v in RULESETS;
