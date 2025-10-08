// src/rulesets/ca/index.ts
import { z } from "zod";
import type { RulesetShape, BaseInput } from "../types";

const extras = z.object({
  firstTimeBuyer: z.coerce.boolean().default(false),
  newBuild: z.coerce.boolean().default(false),
});

const isInsured = (loan: number, dp: number) =>
  loan > 0 ? dp / loan < 0.2 : false;

export const caDefault: RulesetShape<typeof extras> = {
  code: "CA-default",
  currency: "CAD",
  paymentsPerYear: 12,
  loanBounds: { min: 0.01, max: 1_000_000_000 },
  rateBounds: { min: 0, max: 100 },
  termBoundsYears: { min: 1, max: 50 },
  rounding: { moneyDecimals: 2, moneyMode: "half-up", rateDecimals: 3, rateMode: "half-up" },

  extrasSchema: extras,

  deriveCtx: ({ loanAmount, downPayment, firstTimeBuyer, newBuild }) => ({
    insured: isInsured(loanAmount, downPayment),
    firstTimeBuyer,
    newBuild,
  }),

  maxAmortizationYears: ({ loanAmount, downPayment, firstTimeBuyer, newBuild }) => {
    const insured = isInsured(loanAmount, downPayment);
    if (insured && firstTimeBuyer && newBuild) return 30; // insured new build eligible
    return insured ? 25 : 30;
  },
};
