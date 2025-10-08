// src/schemas/mortgageSchemaFactory.ts
import { z } from "zod";
import { RULES, type MortgageRules } from "../config/mortgagerules";
import { roundTo } from "../domain/numberFormats";

export type JurisdictionCtx = {
  code: keyof typeof RULES;   // e.g., "CA-default"
  insured: boolean;           // <20% down
  firstTimeBuyer?: boolean;
  newBuild?: boolean;
};

export const createMortgageSchema = (ctx: JurisdictionCtx) => {
  const rules: MortgageRules = RULES[ctx.code];
  const r = {
    moneyDecimals: rules.rounding?.moneyDecimals ?? 2,
    moneyMode: rules.rounding?.moneyMode ?? "half-up",
    rateDecimals: rules.rounding?.rateDecimals ?? 3,
    rateMode: rules.rounding?.rateMode ?? "half-up",
  };

  const moneyBase = z.coerce.number()
    .nonnegative("Must be zero or positive")
    .max(rules.loanBounds.max, "Value is too high")
    .min(rules.loanBounds.min, "Loan amount must be a positive number")
    .transform(v => roundTo(v, r.moneyDecimals, r.moneyMode));

  const rateBase = z.coerce.number()
    .nonnegative("Interest rate must be zero or positive")
    .max(rules.rateBounds.max, "Interest rate is too high")
    .transform(v => roundTo(v, r.rateDecimals, r.rateMode));

  const termBase = z.coerce.number()
    .int("Term must be a whole number")
    .min(rules.termBoundsYears.min, "Term is too short")
    .max(rules.termBoundsYears.max, "Term is too high");

  const amortMax = rules.maxAmortizationYears(ctx);

  const amortBase = z.coerce.number()
    .int("Amortization must be a whole number")
    .min(rules.termBoundsYears.min, "Amortization is too short")
    .max(amortMax, "Amortization exceeds allowed maximum");

  return z.object({
    loanAmount: moneyBase,
    downPayment: z.preprocess(v => (v === "" || v == null ? 0 : v), moneyBase),
    rate: rateBase,
    term: termBase,
    amortization: amortBase,
  })
  .strict()
  .refine(d => d.downPayment <= d.loanAmount, {
    message: "Down payment cannot exceed loan amount",
    path: ["downPayment"],
  });
};
