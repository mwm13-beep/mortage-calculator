// src/rulesets/ca/index.ts
import { z } from "zod";
import { defineRuleset } from "../factory";
import type { BaseInput, RulesetPlugin } from "../types";
import { EngineResult } from "../../engine/types";
import { CmhcBands, cmhcPremium } from "./premium";

const extras = z.object({
  firstTimeBuyer: z.coerce.boolean().default(false),
  newBuild: z.coerce.boolean().default(false),
});

const bands: CmhcBands = [
  { maxLTV: 0.80, pct: 0 },      // not insured normally
  { maxLTV: 0.85, pct: 0.028 },
  { maxLTV: 0.90, pct: 0.031 },
  { maxLTV: 0.95, pct: 0.04 },
];

const capitalizePremium = true; // default for demo; later user flag can override

const caPlugin: RulesetPlugin<BaseInput & z.infer<typeof extras>, EngineResult> = {
  preCompute(i) {
    const insured = i.loanAmount > 0 ? i.downPayment / i.loanAmount < 0.20 : false;
    return { derived: { insured } };
  },
  adjustPrincipal(principal, i, d) {
    if (!d.insured) return principal;
    const { premium } = cmhcPremium(i.loanAmount, i.downPayment, bands);
    return capitalizePremium ? principal + premium : principal; // capitalize into loan or not
  },
  capAmortization(years, i, d) {
    const insured = Boolean(d.insured);
    if (insured && i.firstTimeBuyer && i.newBuild) return Math.min(years, 30);
    return Math.min(years, insured ? 25 : 30);
  },
};

export const caDefault = defineRuleset({
  code: "CA-default",
  currency: "CAD",
  paymentsPerYear: 12,
  loanBounds: { min: 0.01, max: 1_000_000_000 },
  rateBounds: { min: 0, max: 100 },
  termBoundsYears: { min: 1, max: 50 },
  rounding: { moneyDecimals: 2, moneyMode: "half-up", rateDecimals: 3, rateMode: "half-up" },
  extrasSchema: extras,
  plugin: caPlugin,
});

