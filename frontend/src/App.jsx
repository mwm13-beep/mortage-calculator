import { useState } from 'react';
import { useForm } from 'react-hook-form'
import { mortgageSchema } from '../shared/schemas/mortgageSchema.js'
import { zodResolver } from '@hookform/resolvers/zod'
import './App.css';

export default function App() {
  console.log('Environment:', import.meta.env.MODE);

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
      const response = await fetch('api/mortgage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
    <div style={{ padding: '2rem', maxWidth: '500px', margin: 'auto' }}>
      <h1>Mortgage Calculator</h1>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label>
            Loan Amount ($):
            <input type="number" step="0.01" {...register('loanAmount')} />
            {errors.loanAmount && <p style={{ color: 'red' }}>{errors.loanAmount.message}</p>}
          </label>
        </div>
        <br />
        <div>
          <label>
            Down Payment ($):
            <input type="number" step="0.01" {...register('downPayment')} />
            {errors.downPayment && <p style={{ color: 'red' }}>{errors.downPayment.message}</p>}
          </label>
        </div>
        <br />
        <div>
          <label>
            Interest Rate (% per year):
            <input type="number" step="0.01" {...register('rate')} />
            {errors.rate && <p style={{ color: 'red' }}>{errors.rate.message}</p>}
          </label>
        </div>
        <br />
        <div>
          <label>
            Term (Years):
            <input type="number" step="0.01" {...register('term')} />
            {errors.term && <p style={{ color: 'red' }}>{errors.term.message}</p>}
          </label>          
        </div>
        <br />
        <button type="submit">Calculate</button>
      </form>

      {payment !== null && (
        <div style={{ marginTop: '1rem' }}>
          <h2>Result:</h2>
          <p>Your estimated monthly payment is <strong>${payment.toFixed(2)}</strong></p>
        </div>
      )}
    </div>
  );
}
