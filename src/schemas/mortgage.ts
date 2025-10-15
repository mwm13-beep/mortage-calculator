import { z } from "zod";

export const MortgageOk = z.object({
  payment: z.number(),               
  amortization: z.number().int().positive(),  // 1..?
});

export const MortgageErr = z.object({
  error: z.string(),
  correlationId: z.string().optional(),
  // details?: z.unknown()   // optional in dev
});

export const MortgageResponse = z.union([MortgageOk, MortgageErr]);
export type MortgageResponse = z.infer<typeof MortgageResponse>;
