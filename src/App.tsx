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
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const { computeLocal, computeServer, loading, error, schema } = useCalculatedResults(rulesetCode);

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

  function applyOk(ok: ResponseOk | null) {
    if (!ok || error) {
      clearResult();
      return;
    }
    setPayment(ok.payment);
    setAmortization(ok.amortization);
    setBreakdown(ok.breakdown);
    setDerived(ok.derived ?? null);
  }

  // ---- Separate handlers (no toggling state) ----
  function onLocal(values: ResolvedValues) {
    const ok = computeLocal(values);
    applyOk(ok);
  }

  async function onInline(values: ResolvedValues) {
    const res = await computeServer("both-inline", values); // async
    if (!res) return clearResult();
    applyOk(res.ok);
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(res.pdfUrl ?? null);
  }

  async function onAttachment(values: ResolvedValues) {
    const res = await computeServer("both-download", values); // async
    if (!res) return clearResult();
    applyOk(res.ok);
  }

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="app-shell">
      <div className="card">

        {/* Title */}
        <h1 className="app-title">Mortgage Calculator</h1>

        {/* Jurisdiction */}
        <div className="section-block">
          <label htmlFor="rulesetCode" className="field-label">
            Jurisdiction
          </label>
          <select
            id="rulesetCode"
            value={rulesetCode}
            onChange={(e) => {
              const code = e.target.value as RulesetCode;
              setValue("rulesetCode", code, { shouldDirty: true });
            }}
            className="select-input"
          >
            <option value="CA-default">Canada (Default)</option>
          </select>
        </div>

        {/* Form */}
        <form noValidate className="form-root">
          {/* Loan Details */}
          <fieldset className="fieldset">
            <legend className="fieldset-legend">Loan details</legend>

            <div className="grid-two-col">
              {/* Loan Amount */}
              <div className="field-block">
                <label className="field-label">Loan Amount ($)</label>
                <input
                  type="number"
                  {...register("loanAmount")}
                  className="text-input"
                />
                {errors.loanAmount && (
                  <p className="error-text">
                    {String(errors.loanAmount.message)}
                  </p>
                )}
              </div>

              {/* Down Payment */}
              <div className="field-block">
                <label className="field-label">Down Payment ($)</label>
                <input
                  type="number"
                  {...register("downPayment")}
                  className="text-input"
                />
                {errors.downPayment && (
                  <p className="error-text">
                    {String(errors.downPayment.message)}
                  </p>
                )}
              </div>

              {/* Interest Rate */}
              <div className="field-block">
                <label className="field-label">
                  Interest Rate (% per year)
                </label>
                <input
                  type="number"
                  {...register("rate")}
                  className="text-input"
                />
                {errors.rate && (
                  <p className="error-text">
                    {String(errors.rate.message)}
                  </p>
                )}
              </div>

              {/* Term */}
              <div className="field-block">
                <label className="field-label">Term (Years)</label>
                <input
                  type="number"
                  {...register("term")}
                  className="text-input"
                />
                {errors.term && (
                  <p className="error-text">
                    {String(errors.term.message)}
                  </p>
                )}
              </div>

              {/* Amortization (full row) */}
              <div className="field-block full-row">
                <label className="field-label">Amortization (Years)</label>
                <input
                  type="number"
                  {...register("amortization")}
                  className="text-input"
                />
                {errors.amortization && (
                  <p className="error-text">
                    {String(errors.amortization.message)}
                  </p>
                )}
              </div>
            </div>
          </fieldset>

          {/* Canada-specific */}
          {rulesetCode === "CA-default" && (
            <fieldset className="fieldset">
              <legend className="fieldset-legend">
                Canada-specific
              </legend>

              <div className="checkbox-row">
                <label className="checkbox-item">
                  <input
                    type="checkbox"
                    {...register("firstTimeBuyer")}
                    className="checkbox-input"
                  />
                  <span>First-time buyer</span>
                </label>

                <label className="checkbox-item">
                  <input
                    type="checkbox"
                    {...register("newBuild")}
                    className="checkbox-input"
                  />
                  <span>New build</span>
                </label>
              </div>
            </fieldset>
          )}

          {/* Action buttons */}
          <div className="button-row">
            <button
              type="button"
              onClick={handleSubmit(onLocal)}
              disabled={loading || hasErrors}
              className="btn"
            >
              {loading ? "Calculating…" : "Calculate"}
            </button>

            <button
              type="button"
              onClick={handleSubmit(onInline)}
              disabled={loading || hasErrors}
              className="btn"
            >
              {loading ? "Calculating…" : "Display Detailed Breakdown"}
            </button>

            <button
              type="button"
              onClick={handleSubmit(onAttachment)}
              disabled={loading || hasErrors}
              className="btn"
            >
              {loading ? "Calculating…" : "Download PDF Breakdown"}
            </button>

            <button
              type="button"
              onClick={() => setShowBreakdown((v) => !v)}
              aria-expanded={showBreakdown}
              className="btn"
            >
              {showBreakdown ? "Hide" : "Show"} breakdown
            </button>
          </div>
        </form>

        {/* Results summary */}
        {payment !== null && amortization !== null && (
          <section className="panel">
            <h2 className="panel-heading">Result:</h2>
            <p className="panel-line">
              Your estimated monthly payment is{" "}
              <strong>${payment.toFixed(2)}</strong>
            </p>
            <p className="panel-line">
              The amortization period is{" "}
              <strong>{amortization} years</strong>{" "}
              ({amortization * 12} total payments).
            </p>
            {derived?.insured !== undefined && (
              <p className="panel-footnote">
                Insurance status:{" "}
                <strong>
                  {derived.insured ? "Insured (CMHC)" : "Uninsured"}
                </strong>
              </p>
            )}
          </section>
        )}

        {/* Breakdown + formula */}
        {showBreakdown && breakdown && (
          <section className="panel">
            <div className="panel-section">
              <h3 className="panel-subheading">
                How we calculated your payment
              </h3>
              <code className="code-block">
                Payment = P · r / (1 − (1 + r)<sup>−n</sup>)
              </code>
            </div>

            <ul className="panel-list">
              <li>
                Principal <strong>P</strong> = $
                {breakdown.principal.toFixed(2)}
              </li>
              <li>
                Annual rate = {breakdown.annualRatePercent.toFixed(3)}%
              </li>
              <li>
                Monthly rate <strong>r</strong> ={" "}
                {(breakdown.monthlyRateDecimal * 100).toFixed(3)}%
              </li>
              <li>Payments per year = {breakdown.paymentsPerYear}</li>
              <li>
                Total payments <strong>n</strong> ={" "}
                {breakdown.totalPayments}
              </li>
            </ul>

            <p className="panel-line">
              Plugging in the numbers gives{" "}
              <strong>
                ${breakdown.paymentViaFormula.toFixed(2)}
              </strong>
              {payment !== null &&
              Math.abs(payment - breakdown.paymentViaFormula) > 0.01
                ? " (slight difference due to rounding)"
                : ""}
            </p>
          </section>
        )}

        {/* PDF Preview */}
        {pdfUrl && (
          <section className="panel">
            <h3 className="panel-subheading">PDF Preview</h3>

            <object
              data={pdfUrl}
              type="application/pdf"
              width="100%"
              height="600"
              className="pdf-frame"
            >
              <p className="panel-footnote">
                Can’t display PDF.{" "}
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="link"
                >
                  Open
                </a>
              </p>
            </object>
          </section>
        )}
      </div>
    </div>
  );
}