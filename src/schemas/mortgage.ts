import { z } from "zod";

export const MortgageOk = z.object({
  payment: z.number(),
  amortization: z.number(),
  breakdown: z.object({
    principal: z.number(),
    annualRatePercent: z.number(),
    monthlyRateDecimal: z.number(),
    paymentsPerYear: z.number(),
    totalPayments: z.number(),
    paymentViaFormula: z.number(),
  }).optional()
});

export const MortgageErr = z.object({
  error: z.string(),
  correlationId: z.string().optional(),
  // details?: z.unknown()   // optional in dev
});

export const MortgageResponse = z.union([MortgageOk, MortgageErr]);
export type MortgageResponse = z.infer<typeof MortgageResponse>;
