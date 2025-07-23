import { useState } from 'react';
import './App.css';

export default function App() {
  const [loanAmount, setLoanAmount] = useState('');
  const [downPayment, setDownPayment] = useState('');
  const [rate, setRate] = useState('');
  const [term, setTerm] = useState('');
  const [monthlyPayment, setMonthlyPayment] = useState(null);
  const [error, setError] = useState(null);

  async function submitMortgage(e) {
    e.preventDefault();
    setError(null);
    try {
      const response = await fetch('/api/mortgage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({loanAmount, downPayment, rate, term}),
    });

    const result = await response.json();

    if (typeof result.monthlyPayment === 'number' && !isNaN(result.monthlyPayment)) {
      setMonthlyPayment(result.monthlyPayment);
      setError(null);
    } else {
      setMonthlyPayment(null);
      setError('Calculation failed due to invalid input.');
    }

  } catch(err) {
      console.error("Network or parsing error:", err);
      setMonthlyPayment(null);
      setError('A network or parsing error occurred.');
  }
}

  return (
    <div style={{ padding: '2rem', maxWidth: '500px', margin: 'auto' }}>
      <h1>Mortgage Calculator</h1>
      <form onSubmit={submitMortgage}>
        <div>
          <label>
            Loan Amount ($):
            <input
              type="number"
              value={loanAmount}
              onChange={(e) => setLoanAmount(e.target.value)}
              required
            />
          </label>
        </div>
        <br />
        <div>
          <label>
            Down Payment ($):
            <input
              type="number"
              value={downPayment}
              onChange={(e) => setDownPayment(e.target.value)}
              required
            />
          </label>
        </div>
        <br />
        <div>
          <label>
            Interest Rate (% per year):
            <input
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              required
            />
          </label>
        </div>
        <br />
        <div>
          <label>
            Term (Years):
            <input
              type="number"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              required
            />
          </label>          
        </div>
        <br />
        <button type="submit">Calculate</button>
      </form>

      {error && (
        <div style={{ color: 'red', marginTop: '1rem' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {monthlyPayment !== null && (
        <div style={{ marginTop: '1rem' }}>
          <h2>Result:</h2>
          <p>Your estimated monthly payment is <strong>${monthlyPayment.toFixed(2)}</strong></p>
        </div>
      )}
    </div>

  );
}
