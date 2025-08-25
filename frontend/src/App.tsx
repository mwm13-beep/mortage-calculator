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
// Schema type (runtime value, but we use it for type extraction)
type Schema = ReturnType<typeof createMortgageSchema>;

// RHF "form values" = Zod INPUT (pre-parse, often strings/unknown)
type FormValues = z.input<Schema>;

// Values you get inside onSubmit = Zod OUTPUT (post-parse, numbers)
type ResolvedValues = z.output<Schema>;

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

  const [payment, setPayment] = useState<number | null>(null);

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

      if (typeof result.payment === "number" && !isNaN(result.payment)) {
        setPayment(result.payment);
      } else {
        setPayment(null);
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("Fetch to /api/mortgage failed:", err);
      }
      setPayment(null);
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

      {payment !== null && (
        <div className="margin-top">
          <h2>Result:</h2>
          <p>
            Your estimated monthly payment is{" "}
            <strong>${payment.toFixed(2)}</strong>
          </p>
        </div>
      )}
    </div>
  );
}
