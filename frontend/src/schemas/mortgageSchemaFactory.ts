// src/schemas/mortgageSchemaFactory.ts
import { z } from "zod";
import { RULES, type MortgageRules } from "../config/mortgagerules";

export type JurisdictionCtx = {
  code: keyof typeof RULES;   // e.g., "CA-default"
  insured: boolean;           // <20% down
  firstTimeBuyer?: boolean;
  newBuild?: boolean;
};

export const createMortgageSchema = (ctx: JurisdictionCtx) => {
  const rules: MortgageRules = RULES[ctx.code];

  // Base money constraint used by multiple fields
  const moneyBase = z.coerce.number()
    .nonnegative("Must be zero or positive")
    .max(rules.loanBounds.max, "Value is too high");

  return z.object({
    loanAmount: moneyBase
      .min(rules.loanBounds.min, "Loan amount must be a positive number"),

    downPayment: z.preprocess(
      (v) => (v === "" || v == null ? 0 : v),
      moneyBase),

    rate: z.coerce.number()
      .nonnegative("Interest rate must be zero or positive")
      .max(rules.rateBounds.max, "Interest rate is too high"),

    term: z.coerce.number()
      .int("Term must be a whole number")
      .min(rules.termBoundsYears.min, "Term must be at least 1 year")
      .max(rules.termBoundsYears.max, "Term is too high"),

    amortization: z.coerce.number()
      .int("Amortization must be a whole number")
      .min(1, "Amortization must be at least 1 year")
      .max(rules.maxAmortizationYears(ctx), "Amortization exceeds allowed maximum"),
  })
  .strict()
  .refine(
    (data) => data.downPayment <= data.loanAmount,
    { message: "Down payment cannot exceed loan amount", path: ["downPayment"] }
  );
};
