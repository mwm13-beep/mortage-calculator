import { useMemo, useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createSchemaForRuleset, type InputOf, type OutputOf } from "./schemas/requestFactory";
import { RULESETS, type RulesetCode } from "./rulesets";
import { ResponseOk, ResponseErr } from "./schemas/responseFactory";
import z from "zod";

// shape for the on-demand breakdown panel
type Breakdown = {
  principal: number;            // P
  annualRatePercent: number;    // sanitized %
  monthlyRateDecimal: number;   // r
  paymentsPerYear: number;      // 12
  totalPayments: number;        // n
  paymentViaFormula: number;    // computed from formula (for display parity)
};

export default function App() {
  const [rulesetCode] = useState<RulesetCode>("CA-default");
  const [payment, setPayment] = useState<number|null>(null);
  const [amortization, setAmortization] = useState<number|null>(null);
  const [breakdown, setBreakdown] = useState<Breakdown|null>(null);
  const [derived, setDerived] = useState<{ insured?: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const schema = useMemo(() => createSchemaForRuleset(rulesetCode), [rulesetCode]);

  type FormValues = InputOf<RulesetCode>;
  type ResolvedValues = OutputOf<RulesetCode>;

  const r = RULESETS[rulesetCode];

  // Give RHF the default rulesetCode; keep it synced
  const { register, handleSubmit, formState: { errors }, setValue } =
    useForm<FormValues, any, ResolvedValues>({
      resolver: zodResolver(schema),
      mode: "onTouched",
      criteriaMode: "all",
      defaultValues: { rulesetCode }, // important
    });

  // Ensure rulesetCode is always synced (in case we add a selector later)
  useEffect(() => {
    setValue("rulesetCode", rulesetCode);
  }, [rulesetCode, setValue]);

  function clearResult() {
    setPayment(null);
    setAmortization(null);
    setBreakdown(null);
    setDerived(null);
  }

  function applyOk(d: ResponseOk) {
    setPayment(d.payment);
    setAmortization(d.amortization);
    setBreakdown(d.breakdown);
    setDerived(d.derived ?? null);
  }

  async function onSubmit(data: ResolvedValues) {
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/mortgage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = await res.json().catch(() => null);
      const ok = json && ResponseOk.safeParse(json);
      if (ok?.success) {
        applyOk(ok.data);
        return;
      }
      const err = json && ResponseErr.safeParse(json);
      if (err?.success) {
        if (import.meta.env.DEV) {
          console.error("API error:", err.data.error, err.data.correlationId);
        }
        clearResult();
        return;
      }
      throw new Error(`Unexpected response (status ${res.status})`);
    } catch (e) {
      if (import.meta.env.DEV) console.error("submit failed:", e);
      clearResult();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="container">
      <h1>Mortgage Calculator</h1>

      {/* hidden rulesetCode — no value prop, RHF owns it */}
      <input type="hidden" {...register("rulesetCode")} />

      {/* CA extras (quick, explicit for now) */}
      <label>
        <input type="checkbox" {...register("firstTimeBuyer")} /> First-time buyer
      </label>
      <label>
        <input type="checkbox" {...register("newBuild")} /> New build
      </label>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <div>
          <label>
            Loan Amount ($):
            <input
              type="number"
              min={r.loanBounds.min}
              max={r.loanBounds.max}
              inputMode="decimal"
              {...register("loanAmount")}
              aria-invalid={!!errors.loanAmount}
            />
            {errors.loanAmount && <p className="error-text">{String(errors.loanAmount.message)}</p>}
          </label>
        </div>

        <div>
          <label>
            Down Payment ($):
            <input
              type="number"
              min={0}
              max={r.loanBounds.max}
              inputMode="decimal"
              {...register("downPayment")}
              aria-invalid={!!errors.downPayment}
            />
            {errors.downPayment && <p className="error-text">{String(errors.downPayment.message)}</p>}
          </label>
        </div>

        <div>
          <label>
            Interest Rate (% per year):
            <input
              type="number"
              min={r.rateBounds.min}
              max={r.rateBounds.max}
              inputMode="decimal"
              {...register("rate")}
              aria-invalid={!!errors.rate}
            />
            {errors.rate && <p className="error-text">{String(errors.rate.message)}</p>}
          </label>
        </div>

        <div>
          <label>
            Term (Years):
            <input
              type="number"
              min={r.termBoundsYears.min}
              max={r.termBoundsYears.max}
              inputMode="numeric"
              {...register("term")}
              aria-invalid={!!errors.term}
            />
            {errors.term && <p className="error-text">{String(errors.term.message)}</p>}
          </label>
        </div>

        <div>
          <label>
            Amortization (Years):
            <input
              type="number"
              min={r.termBoundsYears.min}
              max={r.termBoundsYears.max}
              inputMode="numeric"
              {...register("amortization")}
              aria-invalid={!!errors.amortization}
            />
            {errors.amortization && <p className="error-text">{String(errors.amortization.message)}</p>}
          </label>
        </div>

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
          {derived?.insured !== undefined && (
            <p className="hint">
              Insurance status: <strong>{derived.insured ? "Insured (CMHC)" : "Uninsured"}</strong>
            </p>
          )}
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
