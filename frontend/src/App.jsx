import { useState } from 'react';
import { useForm } from 'react-hook-form'
import { mortgageSchema } from '../shared/schemas/mortgageSchema.js'
import { zodResolver } from '@hookform/resolvers/zod'
import './App.css';

export default function App() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(mortgageSchema)
  });

  const[payment, setPayment] = useState(null);

  async function onSubmit(data) {
    
    try {

      //const csrfToken = await fetch('/api/csrf-token').then(res => res.json()).then(data => data.csrfToken);

      const response = await fetch('/api/mortgage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          //'CSRF-Token': csrfToken,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        throw new Error();
      } 

      const result = await response.json();

      if (typeof(result.payment) === 'number' && !isNaN(result.payment)) {
        setPayment(result.payment);
      } else {
        setPayment(null);
      }
    } catch(err) {
        if (process.env.NODE_ENV !== 'production') {
          console.error("Fetch to /api/mortgage failed: ", err);
        }
        setPayment(null);
    }
  }

  return (
    <div className="container">
      <h1>Mortgage Calculator</h1>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label>
            Loan Amount ($):
            <input 
              type="number" 
              step="0.01"
              min="0"
              {...register("loanAmount")}
              aria-invalid={!!errors.loanAmount} />
            {errors.loanAmount && <p className="error-text">{errors.loanAmount.message}</p>}
          </label>
        </div>
        <br />
        <div>
          <label>
            Down Payment ($):
            <input 
              type="number" 
              step="0.01"
              min="0"
              inputMode="decimal"
              {...register("downPayment")}
              aria-invalid={!!errors.downPayment} />
            {errors.downPayment && <p className="error-text">{errors.downPayment.message}</p>}
          </label>
        </div>
        <br />
        <div>
          <label>
            Interest Rate (% per year):
            <input 
              type="number" 
              step="0.01"
              min="0"
              max="100"
              inputMode="decimal"
              {...register('rate')}
              aria-invalid={!!errors.rate} />
            {errors.rate && <p className="error-text">{errors.rate.message}</p>}
          </label>
        </div>
        <br />
        <div>
          <label>
            Term (Years):
            <input 
              type="number" 
              step="1"
              min="1"
              max="50"
              inputMode="numeric"
              {...register('term')} />
            {errors.term && <p className="error-text">{errors.term.message}</p>}
          </label>          
        </div>
        <br />
        <button type="submit">Calculate</button>
      </form>

      {payment !== null && (
        <div class-name="margin-top">
          <h2>Result:</h2>
          <p>Your estimated monthly payment is <strong>${payment.toFixed(2)}</strong></p>
        </div>
      )}
    </div>
  );
}
