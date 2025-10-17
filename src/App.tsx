import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { type InputOf, type OutputOf } from "./schemas/requestFactory";
import { RULESETS, type RulesetCode } from "./rulesets";
import { ResponseOk } from "./schemas/responseFactory";
import { useCalculatedResults } from "./hooks/useCalculatedResults"

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
  const [showBreakdown, setShowBreakdown] = useState(false);

  const { computeLocal, computeApi, loading, error, schema } = useCalculatedResults(rulesetCode);

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

  // ---- Separate handlers (no toggling state) ----
  function onLocal(values: ResolvedValues) {
    const ok = computeLocal(values);     // sync
    applyOk(ok);
  }

  async function onServer(values: ResolvedValues) {
    const ok = await computeApi(values); // async
    if (ok) applyOk(ok);
    else clearResult();
  }

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="page">
      <div className="container">
        <h1>Mortgage Calculator</h1>
        <div className="field">
          <label htmlFor="rulesetCode">Jurisdiction</label>
          <select
            id="rulesetCode"
            value={rulesetCode}
            onChange={(e) => {
              const code = e.target.value as RulesetCode;
              // update component state so the hook re-memoizes the schema
              // and RHF value so it posts the right code
              // (optional) reset results
              // (optional) reset form values if bounds differ greatly
              // setValue is RHF; use setRulesetCode if you want to manage it too
              // You used useState for rulesetCode so:
              // setRulesetCode(code);
              setValue("rulesetCode", code, { shouldDirty: true });
            }}
          >
            <option value="CA-default">Canada (Default)</option>
            {/* later: Object.keys(RULESETS).map(k => <option key={k} value={k}>{k}</option>) */}
          </select>
        </div>
        <form noValidate>
          <fieldset className="card">
            <legend>Loan details</legend>
            <div className="grid-2">
              <div className="field">
                <label>Loan Amount ($)</label>
                <input type="number" /* ... */ {...register("loanAmount")} />
                {errors.loanAmount && <p className="error-text">{String(errors.loanAmount.message)}</p>}
              </div>

              <div className="field">
                <label>Down Payment ($)</label>
                <input type="number" /* ... */ {...register("downPayment")} />
                {errors.downPayment && <p className="error-text">{String(errors.downPayment.message)}</p>}
              </div>

              <div className="field">
                <label>Interest Rate (% per year)</label>
                <input type="number" /* ... */ {...register("rate")} />
                {errors.rate && <p className="error-text">{String(errors.rate.message)}</p>}
              </div>

              <div className="field">
                <label>Term (Years)</label>
                <input type="number" /* ... */ {...register("term")} />
                {errors.term && <p className="error-text">{String(errors.term.message)}</p>}
              </div>

              <div className="field">
                <label>Amortization (Years)</label>
                <input type="number" /* ... */ {...register("amortization")} />
                {errors.amortization && <p className="error-text">{String(errors.amortization.message)}</p>}
              </div>
            </div>
          </fieldset>

          {rulesetCode === "CA-default" && (
            <fieldset className="card">
              <legend>Canada-specific</legend>
              <div className="row gap">
                <label><input type="checkbox" {...register("firstTimeBuyer")} /> First-time buyer</label>
                <label><input type="checkbox" {...register("newBuild")} /> New build</label>
              </div>
            </fieldset>
          )}
        <div className="row gap">
          <button
            type="button"
            onClick={handleSubmit(onLocal)}
            disabled={loading || hasErrors}
          >
            {loading ? "Calculating…" : "Calculate"}
          </button>

          <button
            type="button"
            onClick={handleSubmit(onServer)}
            disabled={loading || hasErrors}
          >
            {loading ? "Calculating…" : "Download PDF Breakdown"}
          </button>

          <button
            type="button"
            onClick={() => setShowBreakdown(v => !v)}
            aria-expanded={showBreakdown}
          >
            {showBreakdown ? "Hide" : "Show"} breakdown
          </button>
        </div>
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
    </div>
  );
}
