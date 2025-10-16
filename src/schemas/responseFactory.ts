// src/schemas/responseFactory.ts
import { z } from "zod";
import type { EngineResult } from "../engine/types";

// Zod schema the UI will use to parse/validate
export const ResponseOk = z.object({
  payment: z.number(),
  amortization: z.number(),
  breakdown: z.object({
    principal: z.number(),
    annualRatePercent: z.number(),
    monthlyRateDecimal: z.number(),
    paymentsPerYear: z.number(),
    totalPayments: z.number(),
    paymentViaFormula: z.number(),
  }),
  // 🔐 jurisdiction-specific stuff lives here but stays generic on the wire
  derived: z.record(z.string(), z.unknown()).default({}),
});

export type ResponseOk = z.infer<typeof ResponseOk>;

export const ResponseErr = z.object({
  error: z.string(),
  correlationId: z.string().optional(),
  // details?: z.unknown() // (dev only if you want)
});
export type ResponseErr = z.infer<typeof ResponseErr>;

export const ResponseUnion = z.union([ResponseOk, ResponseErr]);
export type ResponseUnion = z.infer<typeof ResponseUnion>;

// Builder that converts an EngineResult into the wire shape
export function makeOk(r: EngineResult): ResponseOk {
  return {
    payment: r.payment,
    amortization: r.totalPayments / r.paymentsPerYear,
    breakdown: {
      principal: r.principal,
      annualRatePercent: r.annualRatePercent,
      monthlyRateDecimal: r.periodicRateDecimal,
      paymentsPerYear: r.paymentsPerYear,
      totalPayments: r.totalPayments,
      paymentViaFormula: r.payment,
    },
    derived: r.derived ?? {},
  };
}
