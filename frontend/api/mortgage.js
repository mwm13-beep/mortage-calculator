import { mortgageSchema } from "../shared/schemas/mortgageSchema";
import { flattenError } from "zod";

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const result = mortgageSchema.safeParse(req.body);

    if (!result.success) {
      const flattened = flattenError(result.error);

      if (process.env.NODE_ENV !== "production") {
        console.error("Validation error: ", flattened);
      }

      return res.status(400).json({ error: "Invalid input" });
    }

    // ✅ Run your calculation logic (placeholder)
    const principal = loanAmount - downPayment;
    const monthlyRate = rate / 100 / 12;
    const numberOfPayments = term * 12;
    const payment =
      (principal * monthlyRate) /
      (1 - Math.pow(1 + monthlyRate, -numberOfPayments));

    return res.status(200).json({ payment });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
