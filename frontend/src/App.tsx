// src/App.tsx
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import "./App.css";

import {
  createMortgageSchema,
  type JurisdictionCtx,
} from "./schemas/mortgageSchemaFactory";
import {
  toCents,
  fromCents,
  toMilliPercent,
  fromMilliPercent,
} from "./domain/numberFormats";

// ----- Types derived from the factory schema -----
type Schema = ReturnType<typeof createMortgageSchema>;
type FormValues = z.input<Schema>;
type ResolvedValues = z.output<Schema>;

// New: shape for the on-demand breakdown panel
type Breakdown = {
  principal: number;            // P
  annualRatePercent: number;    // sanitized %
  monthlyRateDecimal: number;   // r
  paymentsPerYear: number;      // 12
  totalPayments: number;        // n
  paymentViaFormula: number;    // computed from formula (for display parity)
};

export default function App() {
  // Fixed CA context for now; can be made dynamic later
  const ctx: JurisdictionCtx = useMemo(
    () => ({
      code: "CA-default",
      insured: false,
      firstTimeBuyer: false,
      newBuild: false,
    }),
    []
  );

  // Build schema from factory
  const schema = useMemo(() => createMortgageSchema(ctx), [ctx]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues, any, ResolvedValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    reValidateMode: "onChange",
  });

  //type checker helper
  function isNumber(value: unknown): value is number {
    return typeof value === "number" && !isNaN(value);
  }

  const [payment, setPayment] = useState<number | null>(null);
  const [amortization, setAmortization] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  async function onSubmit(data: ResolvedValues) {
    try {
      // Normalize values consistently before sending
      const sanitized: ResolvedValues = {
        ...data,
        loanAmount: fromCents(toCents(Number(data.loanAmount))),
        downPayment: fromCents(toCents(Number(data.downPayment))),
        rate: fromMilliPercent(toMilliPercent(Number(data.rate))),
        term: Number(data.term),
        amortization: Number(data.amortization),
      };

      const response = await fetch("/api/mortgage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sanitized),
      });

      if (!response.ok) {
        if (import.meta.env.DEV) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        throw new Error();
      }

      const result = await response.json();

      if (isNumber(result.payment) && isNumber(result.amortization)) {
        setPayment(result.payment);
        setAmortization(result.amortization);
      } else {
        setPayment(null);
        setAmortization(null);
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("Fetch to /api/mortgage failed:", err);
      }
      setPayment(null);
      setAmortization(null);
    }
  }

  return (
    <div className="container">
      <h1>Mortgage Calculator</h1>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div>
          <label>
            Loan Amount ($):
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              {...register("loanAmount")}
              aria-invalid={!!errors.loanAmount}
            />
            {errors.loanAmount && (
              <p className="error-text">{errors.loanAmount.message as string}</p>
            )}
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
              aria-invalid={!!errors.downPayment}
            />
            {errors.downPayment && (
              <p className="error-text">{errors.downPayment.message as string}</p>
            )}
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
              {...register("rate")}
              aria-invalid={!!errors.rate}
            />
            {errors.rate && (
              <p className="error-text">{errors.rate.message as string}</p>
            )}
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
              {...register("term")}
              aria-invalid={!!errors.term}
            />
            {errors.term && (
              <p className="error-text">{errors.term.message as string}</p>
            )}
          </label>
        </div>

        <br />

        <div>
          <label>
            Amortization (Years):
            <input
              type="number"
              step="1"
              min="1"
              max="50"
              inputMode="numeric"
              {...register("amortization")}
              aria-invalid={!!errors.amortization}
            />
            {errors.amortization && (
              <p className="error-text">{errors.amortization.message as string}</p>
            )}
          </label>
        </div>

        <br />
        <button type="submit">Calculate</button>
      </form>

      {payment !== null && amortization !== null && (
        <div className="margin-top">
          <h2>Result:</h2>
          <p>
            Your estimated monthly payment is{" "}
            <strong>${payment.toFixed(2)}</strong>
          </p>
          <p>
            The amortization period is <strong>{amortization} years</strong>
            {" "}({amortization * 12} total payments).
          </p>
        </div>
      )}

      {/* Toggle button to show how we calculated it */}
      <button
        type="button"
        onClick={() => setShowBreakdown((v) => !v)}
        aria-expanded={showBreakdown}
        className="secondary"
      >
        {showBreakdown ? "Hide" : "Show"} breakdown
      </button>
      {showBreakdown && breakdown && (
        <div className="calc-breakdown">
          <h3>How we calculated your payment</h3>
          <p><code>Payment = P · r / (1 − (1 + r)<sup>−n</sup>)</code></p>
          <ul>
            <li>Principal <strong>P</strong> = ${breakdown.principal.toFixed(2)}</li>
            <li>Annual rate = {breakdown.annualRatePercent.toFixed(3)}%</li>
            <li>Monthly rate <strong>r</strong> = { (breakdown.monthlyRateDecimal * 100).toFixed(3) }%</li>
            <li>Payments per year = {breakdown.paymentsPerYear}</li>
            <li>Total payments <strong>n</strong> = {breakdown.totalPayments}</li>
          </ul>
          <p>
            Plugging in the numbers gives{" "}
            <strong>${breakdown.paymentViaFormula.toFixed(2)}</strong>
            {payment !== null && Math.abs(payment - breakdown.paymentViaFormula) > 0.01
              ? " (slight difference due to rounding)"
              : ""}
          </p>
        </div>
      )}
    </div>
  );
}
