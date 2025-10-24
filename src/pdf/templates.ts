import { escapePdfText, clampLen, asStr, moneyStr } from "./templateUtils";
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

  // Inputs (lightly derived from ok.breakdown + known inputs from ok)
  push("Inputs:");
  push(`  Principal (P): ${ok.breakdown.principal}`);
  push(`  Annual rate:   ${ok.breakdown.annualRatePercent}`);
  push(`  Payments/year: ${ok.breakdown.paymentsPerYear}`);
  push(`  Total payments (n): ${ok.breakdown.totalPayments}`);
  push("");

  // Result summary
  push("Results:");
  push(`  Payment: ${ok.payment}`);
  push(`  Amortization: ${ok.amortization} yrs`);
  if (typeof ok.derived?.insured === "boolean") {
    push(`  Insured: ${ok.derived.insured ? "Yes (CMHC)" : "No"}`);
  }
  push("");

  // ---------- SCHEDULE SECTION (first 12 + last 5 using O(1) math) ----------
  const i = ok.breakdown.monthlyRateDecimal;
  const n = ok.breakdown.totalPayments;
  const P = ok.breakdown.principal;
  const A = ok.payment;

  function balanceAfter(k: number) {
    // balance immediately AFTER k payments (k >= 0)
    const g = Math.pow(1 + i, k);
    return P * g - A * ((g - 1) / i);
  }
  function rowLine(k: number) {
    // row k (1-indexed): amounts paid on the k-th payment
    const balBefore = balanceAfter(k - 1);
    const interest = balBefore * i;
    const principalPaid = A - interest;
    const balAfter = Math.max(0, balBefore - principalPaid);

    const kStr  = String(k).padStart(3);
    const balS  = moneyStr(balAfter).padStart(10);
    const intS  = moneyStr(interest).padStart(10);
    const ppS   = moneyStr(principalPaid).padStart(10);
    const payS  = moneyStr(A).padStart(10);
    return `${kStr} ${balS} ${intS} ${ppS} ${payS}`;
  }

  const K_FIRST = Math.min(12, n);
  push("Payment schedule (first 12 + last 5):");
  push("  #     Balance     Interest    Principal   Payment");

  for (let k = 1; k <= K_FIRST; k++) push(rowLine(k));
  if (n > K_FIRST + 5) {
    push("  ...");
    for (let k = n - 4; k <= n; k++) push(rowLine(k));
  } else if (n > K_FIRST) {
    for (let k = K_FIRST + 1; k <= n; k++) push(rowLine(k));
  }
  push("");

  //----- FOOTER SECTION -----
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

  // ---------- NICER STREAM (bold title, divider rule, consistent leading) ----------
  const leading = 14;
  const startX = 50;
  const startY = 780;

  // Where is the schedule header in the lines array?
  const schedIdx = lines.findIndex(l => l.text.startsWith("Payment schedule"));
  const linesBeforeSched = schedIdx === -1 ? 0 : schedIdx;

  // Helper to compute the absolute Y of a logical line index in `lines`
  // We have: 2 (title+date) + 1 (extra spacer) before switching to F1.
  // After that, each line consumes `leading`.
  const yForLine = (idx: number) => startY - leading * (2 + 1 + idx);

  // Gray stripe behind the schedule header row (slightly taller than leading)
  const stripeY  = yForLine(linesBeforeSched) + 2;       // a smidge above text baseline
  const stripeH  = leading + 4;
  const stripeW  = 545 - startX;

  // Build the text lines once
  const textBlock = lines
    .map(({ text }) => `(${escapePdfText(clampLen(text))}) Tj 0 -${leading} Td`)
    .join("\n");

  // --- Graphics first (behind), then text ---
  const stream = `
  q
  0.9 g 0 G
  ${startX} ${stripeY} ${stripeW} ${stripeH} re f
  Q
  BT
  /F2 18 Tf
  ${startX} ${startY} Td
  (Mortgage Breakdown    ${jurisdiction || ""}) Tj 0 -${leading} Td
  (${now.toISOString().slice(0,10)}) Tj 0 -${leading} Td
  0 -${leading} Td
  /F1 12 Tf
  ${textBlock}
  ET
  q 0 g 0.6 G 0.5 w
  50 728 m 545 728 l S
  Q
  `;
  const streamBytes = enc.encode(stream);
  addObj(4, `<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream`);

  // Also add a bold font object once (beside F1=Helvetica)
  addObj(5, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  addObj(6, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`);
  addObj(3, `<< /Type /Page /Parent 2 0 R
    /MediaBox [0 0 595 842]
    /Contents 4 0 R
    /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`);

  const xrefStart = off;
  emit(`xref\n0 6\n`);
  emit(`0000000000 65535 f \n`);
  for (let idx = 1; idx <= 5; idx++) {
    const pos = String(xref[idx] ?? 0).padStart(10, "0");
    emit(`${pos} 00000 n \n`);
  }

  emit(`trailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  const total = chunks.reduce((n,b)=>n+b.length,0);
  const out = new Uint8Array(total);
  let p = 0; for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}
