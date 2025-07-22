import { useState } from 'react';
import './App.css';

function calculateMonthlyPayment(principal, downpayment, annualRate, years) {
  const loanAmount = principal - downpayment;
  const monthlyRate = annualRate / 100 / 12;
  const months = years * 12;
  return (loanAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months));
}


export default function App() {
  const [principal, setPrincipal] = useState('');
  const [downpayment, setDownPayment] = useState('');
  const [rate, setRate] = useState('');
  const [years, setYears] = useState('');
  const [monthlyPayment, setMonthlyPayment] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    const payment = calculateMonthlyPayment(
      parseFloat(principal),
      parseFloat(downpayment),
      parseFloat(rate),
      parseInt(years)
    );
    setMonthlyPayment(payment.toFixed(2));
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '500px', margin: 'auto' }}>
      <h1>Mortgage Calculator</h1>
      <form onSubmit={handleSubmit}>
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
