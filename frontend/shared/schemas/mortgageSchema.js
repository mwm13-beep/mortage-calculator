import { z } from 'zod';

export const mortgageSchema = z.object({
    loanAmount: z.coerce.number().positive("Loan amount must be a positive number"),
    downPayment: z
        .union([
        z.string().length(0, "Down payment must be a positive number or blank"),
        z.coerce.number().min(0, "Down payment must be a positive number or blank")
        ])
        .optional(),
    rate: z.coerce.number().positive("Interest rate must be a positive number"),
    term: z.coerce.number().int().positive("Term must be a positive number"),
});