// src/rulesets/ca/index.ts
import { z } from "zod";
import type { RulesetShape, BaseInput } from "../types";

const extras = z.object({
  firstTimeBuyer: z.coerce.boolean().default(false),
  newBuild: z.coerce.boolean().default(false),
});

const computeDerived = (i: BaseInput & z.infer<typeof extras>) => ({
  insured: i.loanAmount > 0 ? i.downPayment / i.loanAmount < 0.2 : false,
  firstTimeBuyer: i.firstTimeBuyer,
  newBuild: i.newBuild,
});

export const caDefault: RulesetShape<typeof extras> = {
  code: "CA-default",
  currency: "CAD",
  paymentsPerYear: 12,
  loanBounds: { min: 0.01, max: 1_000_000_000 },
  rateBounds: { min: 0, max: 100 },
  termBoundsYears: { min: 1, max: 50 },
  rounding: { moneyDecimals: 2, moneyMode: "half-up", rateDecimals: 3, rateMode: "half-up" },

  extrasSchema: extras,

  deriveCtx: computeDerived,

  maxAmortizationYears: (i) => {
    const { insured, firstTimeBuyer, newBuild } = computeDerived(i);
    if (insured && firstTimeBuyer && newBuild) return 30; // insured new build eligible
    return insured ? 25 : 30;
  },
};
