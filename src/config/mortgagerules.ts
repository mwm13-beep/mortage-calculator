// src/config/mortgagerules.ts
export type MortgageRules = {
  currency: string;
  paymentsPerYear: number;
  loanBounds: { min: number; max: number };
  rateBounds: { min: number; max: number };
  termBoundsYears: { min: number; max: number };
  minAmortizationYears: number;
  maxAmortizationYears: (ctx: { insured: boolean; firstTimeBuyer?: boolean; newBuild?: boolean }) => number;
  rounding?: {
    moneyDecimals: number;   // default 2
    moneyMode: "half-up" | "bankers"; // default "half-up"
    rateDecimals: number;    // default 3
    rateMode: "half-up" | "bankers";  // default "half-up"
  };
};

export const RULES: Record<string, MortgageRules> = {
  "CA-default": {
    currency: "CAD",
    paymentsPerYear: 12,
    loanBounds: { min: 0.01, max: 1_000_000_000 }, // legacy values
    rateBounds: { min: 0, max: 100 },
    termBoundsYears: { min: 1, max: 50 },
    minAmortizationYears: 1,
    maxAmortizationYears: ({ insured, firstTimeBuyer, newBuild }) => {
      if (insured && firstTimeBuyer && newBuild) return 30; // eligible insured new build
      return insured ? 25 : 30; // insured vs uninsured default
    },
    rounding: {
      moneyDecimals: 2,
      moneyMode: "half-up",
      rateDecimals: 3,
      rateMode: "half-up",
    },
  },
} as const;
