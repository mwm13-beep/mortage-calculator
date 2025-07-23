import { useState } from 'react';
import { useForm } from 'react-hook-form'
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers'
import './App.css';

export default function App() {

  const mortgageSchema = z.object({
    loanAmount: z.coerce.number().positive("Loan amount must be a positive number"),
    downPayment: z
      .union([
        z.string().length(0), //allows blank field
        z.coerce.number().min(0, "Down payment must be a positive number")
      ])
      .optional(),
    rate: z.coerce.number().positive("Interest rate must be a positive number"),
    term: z.coerce.int().positive("Term must be a positive number"),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(mortgageSchema)
  });

  const[payment, setPayment] = useState(null);
  const[error, setError] = useState(null);

  async function onSubmit(data) {
    setError(null);
    
    try {
      const response = fetch('api/mortgage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      
    } catch {

    }
  }

  async function submitMortgage(e) {
    e.preventDefault();
    setError(null);

    //parse inputs as numbers
    const loan = parseFloat(loanAmount);
    const down = parseFloat(downPayment);
    const interest = parseFloat(rate);
    const years = parseInt(term,10);

    //validate inputs
    if (isNaN(loan) || loan <= 0) {
      setError("Loan amount must be a positive number");
      return;
    }
    if (downPayment.trim() !== '') {
      if (isNaN(down) || down <= 0) {
        setError("If a down payment is set, it must be 0 or a positive number.");
        return;
      }
    }
    if (isNaN(interest) || interest <= 0) {
      setError("Interest must be a positive number");
      return;
    }
    if (isNaN(years) || years <= 0) {
      setError("Term must be a positive number.");
      return;
    }

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
