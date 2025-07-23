import { useState } from 'react';
import './App.css';

export default function App() {
  const [principal, setPrincipal] = useState('');
  const [downpayment, setDownPayment] = useState('');
  const [rate, setRate] = useState('');
  const [years, setYears] = useState('');
  const [monthlyPayment, setMonthlyPayment] = useState(null);

  async function submitMortgage(e) {
    e.preventDefault();
    try {
      const response = await fetch('/api/mortgage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({principal, downpayment, rate, years, monthlyPayment}),
  });

  if (!response.ok) {
    // Handle error
    const error = await response.json();
    console.error(error);
    return;
  }
    
  const result = await response.json();
  console.log('API result:', result);
  setMonthlyPayment(result.monthlyPayment);
  } catch(err) {
    console.error("Network or parsing error: ", err);
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
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
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
              value={downpayment}
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
              value={years}
              onChange={(e) => setYears(e.target.value)}
              required
            />
          </label>          
        </div>
        <br />
        <button type="submit">Calculate</button>
      </form>

      {monthlyPayment && (
        <div style={{ marginTop: '1rem' }}>
          <h2>Result:</h2>
          <p>Your estimated monthly payment is <strong>${monthlyPayment}</strong></p>
        </div>
      )}
    </div>
  );
}
