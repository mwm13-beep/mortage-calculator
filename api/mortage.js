export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { loanAmount, downPayment, rate, term } = req.body;

    // ✅ Input validation
    if (
      typeof loanAmount !== 'number' || principal <= 0 ||
      typeof downPayment !== 'number' || downPayment <= 0||
      typeof rate !== 'number' || rate <= 0 ||
      typeof term !== 'number' || term <= 0
    ) {
      return res.status(400).json({ error: 'Invalid input data types' });
    }

    // ✅ Run your calculation logic (placeholder)
    const principal = loanAmount - downPayment;
    const monthlyRate = rate / 100 / 12;
    const numberOfPayments = term * 12;
    const monthlyPayment =
      (principal * monthlyRate) /
      (1 - Math.pow(1 + monthlyRate, -numberOfPayments));

    return res.status(200).json({ monthlyPayment });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
