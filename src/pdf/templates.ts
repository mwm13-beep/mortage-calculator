import { escapePdfText, clampLen, fm } from "./templateUtils";
import type { ResponseOk } from "../schemas/responseFactory";
import type { RulesetCode } from "../rulesets";

// Render the whole page as text operators.
// Keep widths small (MediaBox 595×842 for A4; we used 300×144; let’s bump slightly).
export function renderMortgagePdf(ok: ResponseOk, jurisdiction: RulesetCode, now = new Date()): Uint8Array {
  // Build lines; each line is positioned at (x,y) with Helvetica 10/12pt.
  // You can later swap to multiple fonts/sizes if desired.

  const lines: Array<{y: number, text: string}> = [];
  let y = 120; // start high, then go down

  const push = (t: string) => lines.push({ y: y -= 14, text: t });
  
  // Header
  const jurisdictionLabel = jurisdiction ? jurisdiction : "";
  push(`Mortgage Breakdown — ${jurisdictionLabel}`);
  push(now.toISOString().slice(0,10));
  push("");

  // Inputs (lightly derived from ok.breakdown + known inputs from ok)
  push("Inputs:");
  push(`  Principal (P): ${fm.money(ok.breakdown.principal)}`);
  push(`  Annual rate:   ${fm.pct(ok.breakdown.annualRatePercent)}`);
  push(`  Payments/year: ${ok.breakdown.paymentsPerYear}`);
  push(`  Total payments (n): ${ok.breakdown.totalPayments}`);
  push("");

  // Result summary
  push("Results:");
  push(`  Payment: ${fm.money(ok.payment)}`);
  push(`  Amortization: ${ok.amortization} yrs`);
  if (typeof ok.derived?.insured === "boolean") {
    push(`  Insured: ${ok.derived.insured ? "Yes (CMHC)" : "No"}`);
  }
  push("");

  // Schedule summary (first K rows + last row)
  // Keep it small for demo; later you can stream more pages if needed.
  const K = 12; // first year
  push("Payment schedule (first 12 + last):");
  push("  #     Balance     Interest    Principal   Payment");
  // Client doesn’t have a full schedule — so compute simple synthetic rows:
  // NOTE: This preserves performance; later you can plug your detailed schedule function here.
  const r = ok.breakdown.monthlyRateDecimal;    // periodic decimal
  let bal = ok.breakdown.principal;
  for (let i = 1; i <= Math.min(K, ok.breakdown.totalPayments); i++) {
    const interest = bal * r;
    const principalPaid = ok.payment - interest;
    bal = Math.max(0, bal - principalPaid);
    push(
      `  ${String(i).padStart(3)}  ${fm.money(bal).padStart(10)}  ` +
      `${fm.money(interest).padStart(10)}  ${fm.money(principalPaid).padStart(10)}  ${fm.money(ok.payment).padStart(10)}`
    );
  }
  if (ok.breakdown.totalPayments > K) {
    push("  …");
    push(`  ${String(ok.breakdown.totalPayments).padStart(3)}  $0.00       (final row)`);
  }
  push("");

  // Footer
  push("Demo PDF — not for official use.");

  // ---- Construct minimal PDF (one page, Helvetica) ----
  const enc = new TextEncoder();
  const xref: number[] = [];
  const chunks: Uint8Array[] = [];
  let off = 0;

  const emit = (s: string) => { const b = enc.encode(s); chunks.push(b); off += b.length; };
  const addObj = (i: number, body: string) => { xref[i] = off; emit(`${i} 0 obj\n${body}\nendobj\n`); };

  emit("%PDF-1.4\n");
  addObj(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  addObj(2, `<< /Type /Pages /Count 1 /Kids [3 0 R] >>`);

  // Build one content stream with lines
  const content = lines.map(({y, text}) => {
    const safe = escapePdfText(clampLen(text));
    return `0 ${y} Td (${safe}) Tj 0 -14 Td`;
  }).join("\n");

  const stream = `BT /F1 12 Tf 50 780 Td\n${content}\nET`;
  addObj(4, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);

  addObj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`);
  addObj(5, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);

  const xrefStart = off;
  emit(`xref\n0 6\n`);
  emit(`0000000000 65535 f \n`);
  for (let i = 1; i <= 5; i++) {
    const pos = String(xref[i] ?? 0).padStart(10,"0");
    emit(`${pos} 00000 n \n`);
  }
  emit(`trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const total = chunks.reduce((n,b)=>n+b.length,0);
  const out = new Uint8Array(total);
  let p = 0; for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}
