// src/config/mortgagerules.ts
export type MortgageRules = {
  currency: string;
  paymentsPerYear: number;
  loanBounds: { min: number; max: number };
  rateBounds: { min: number; max: number };
  termBoundsYears: { min: number; max: number };
  maxAmortizationYears: (ctx: { insured: boolean; firstTimeBuyer?: boolean; newBuild?: boolean }) => number;
  // (stress-test stays in business logic / calc layer)
};

export const RULES: Record<string, MortgageRules> = {
  "CA-default": {
    currency: "CAD",
    paymentsPerYear: 12,
    loanBounds: { min: 0.01, max: 1_000_000_000 }, // legacy values
    rateBounds: { min: 0, max: 100 },
    termBoundsYears: { min: 1, max: 50 },
    maxAmortizationYears: ({ insured, firstTimeBuyer, newBuild }) => {
      if (insured && firstTimeBuyer && newBuild) return 30; // eligible insured new build
      return insured ? 25 : 30; // insured vs uninsured default
    },
  },
} as const;
