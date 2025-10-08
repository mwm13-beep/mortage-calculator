import { z } from "zod";
import { RULESETS, type RulesetCode } from "../rulesets";
import type { RulesetShape } from "../rulesets/types";
import { roundTo } from "../domain/numberFormats";

function baseSchemaFor(r: RulesetShape) {
  const mDec = r.rounding.moneyDecimals, mMode = r.rounding.moneyMode;
  const rDec = r.rounding.rateDecimals,  rMode = r.rounding.rateMode;

  const money = z.coerce.number()
    .nonnegative("Must be positive")
    .max(r.loanBounds.max, "Loan amount is too high")
    .min(r.loanBounds.min, "Loan amount is too small")
    .transform(v => roundTo(v, mDec, mMode));

  const rate = z.coerce.number()
    .nonnegative("Interest rate must be zero or positive")
    .max(r.rateBounds.max, "Interest rate is too high")
    .transform(v => roundTo(v, rDec, rMode));

  const yearsIn = z.coerce.number()
    .int("Must be a whole number")
    .min(r.termBoundsYears.min, "Value is too small")
    .max(r.termBoundsYears.max, "Value is too high");

  return z.object({
    rulesetCode: z.literal(r.code),
    loanAmount: money,
    downPayment: z.preprocess(v => (v === "" || v == null ? 0 : v), money),
    rate,
    term: yearsIn,
    amortization: yearsIn,
  });
}

export function createSchemaForRuleset(code: RulesetCode) {
  const ruleset = RULESETS[code];
  const base = baseSchemaFor(ruleset).strict();      // lock unknown keys for the base fields
  const schema = base.and(ruleset.extrasSchema);     // intersection (aka z.intersection)

  return schema.superRefine((data, ctx) => {
    // cross-field: DP ≤ loan
    if (data.downPayment > data.loanAmount) {
      ctx.addIssue({ code: "custom", path: ["downPayment"], message: "Down payment cannot exceed loan amount" });
    }
    // insured + cap (jurisdiction-specific but derived safely here)
    // const derived = ruleset.deriveCtx(data as any);
    const maxA = ruleset.maxAmortizationYears(data as any);
    if (data.amortization > maxA) {
      ctx.addIssue({
        code: "custom",
        path: ["amortization"],
        message: `Amortization exceeds ${maxA} years for selected options`,
      });
    }
  });
}

// Handy types
export type SchemaOf<C extends RulesetCode> = ReturnType<typeof createSchemaForRuleset>;
export type InputOf<C extends RulesetCode> = z.input<SchemaOf<C>>;
export type OutputOf<C extends RulesetCode> = z.output<SchemaOf<C>>;
