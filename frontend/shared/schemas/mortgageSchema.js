import { z } from 'zod';

const round2 = (v) => Math.round(v * 100) / 100;

const moneyBase = z.coerce.number()
  .nonnegative("Must be zero or positive")
  .max(1_000_000_000, "Value is too high");

// Now use moneyBase for each field, add field‑specific min BEFORE transform:
export const mortgageSchema = z.object({
  loanAmount: moneyBase
    .min(0.01, "Loan amount must be a positive number")
    .transform(round2),

  downPayment: z.preprocess(
    (val) => (val === '' || val == null ? 0 : val),
    moneyBase.transform(round2) // min 0 already implied by nonnegative()
  ),

  rate: z.coerce.number()
    .nonnegative("Interest rate must be zero or positive")
    .max(100, "Interest rate is too high")
    .transform(v => Math.round(v * 1000) / 1000),

  term: z.coerce.number()
    .int("Term must be a whole number")
    .min(1, "Term must be at least 1 year")
    .max(50, "Term is too high"),
})
.strict()
.check((data, ctx) => {
  if (data.downPayment > data.loanAmount) {
    ctx.addIssue({ code: "custom", message: "Down payment cannot exceed loan amount", path: ["downPayment"] });
  }
});
