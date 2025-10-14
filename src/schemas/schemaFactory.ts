// src/schemas/schemaFactory.ts
import { z } from "zod";
import { RULESETS, type RulesetCode } from "../rulesets";
import type { BuiltRuleset } from "../rulesets/types";

function baseSchemaFor(r: BuiltRuleset) {
  const moneyNumber = z.coerce.number()
    .nonnegative("Must be positive")
    .max(r.loanBounds.max, "Loan amount is too high")
    .min(r.loanBounds.min, "Loan amount is too small")
    .transform((v) => r.roundingFns.money(v));

  const rate = z.coerce.number()
    .nonnegative("Interest rate must be zero or positive")
    .max(r.rateBounds.max, "Interest rate is too high")
    .transform((v) => r.roundingFns.ratePct(v));

  const yearsIn = z.coerce.number()
    .int("Must be a whole number")
    .min(r.termBoundsYears.min, "Value is too small")
    .max(r.termBoundsYears.max, "Value is too high");

  return z.object({
    rulesetCode: z.literal(r.code),
    loanAmount: moneyNumber,
    downPayment: z.preprocess(v => (v === "" || v == null ? 0 : v), moneyNumber),
    rate,
    term: yearsIn,
    amortization: yearsIn,
  });
}

export function createSchemaForRuleset<C extends RulesetCode>(code: C) {
  const ruleset = RULESETS[code];                 // <-- BuiltRuleset
  const base = baseSchemaFor(ruleset);   // lock unknown base keys
  const schema = base.extend(ruleset.extrasSchema.shape).strict();  // intersection

  return schema.superRefine((data, ctx) => {
    if (data.downPayment > data.loanAmount) {
      ctx.addIssue({ code: "custom", path: ["downPayment"], message: "Down payment cannot exceed loan amount" });
    }
  });
}

// Handy types
export type SchemaOf<C extends RulesetCode> = ReturnType<typeof createSchemaForRuleset>;
export type InputOf<C extends RulesetCode> = z.input<SchemaOf<C>>;
export type OutputOf<C extends RulesetCode> = z.output<SchemaOf<C>>;
