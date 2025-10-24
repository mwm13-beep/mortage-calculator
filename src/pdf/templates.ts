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
  // Layout constants
  const bodyLeading   = 14;   // line spacing for body text (F1 12pt)
  const headerLeading = 20;   // line spacing for header lines (F2 18pt). Bigger because font is bigger.
  const startX        = 50;   // left margin for text block
  const maxX          = 545;  // right edge of our layout box
  const startY        = 780;  // top baseline for the first header line

  // Helper: build the header block (title + date + spacer) as PDF ops,
  // and tell us where the body text should start vertically.
  //
  // Returns:
  // - headerOps: PDF text operators for header lines
  // - bodyStartY: the Y-coordinate of the FIRST body line baseline
  //
  function buildHeaderOps() {
    // Line 0 (title)
    // After we draw it, we move down headerLeading
    // Line 1 (date)
    // After we draw it, we move down headerLeading
    //
    // Then we add a spacer line the size of bodyLeading
    //
    // bodyStartY is: startY - headerLeading - headerLeading - bodyLeading

    const headerOps = [
      `(Mortgage Breakdown    ${jurisdiction || ""}) Tj 0 -${headerLeading} Td`,
      `(${now.toISOString().slice(0,10)}) Tj 0 -${headerLeading} Td`,
      `0 -${bodyLeading} Td`, // spacer before body font switch
    ].join("\n");

    const bodyStartY =
      startY - headerLeading - headerLeading - bodyLeading;

    return { headerOps, bodyStartY };
  }

  const { headerOps, bodyStartY } = buildHeaderOps();

  // Now we know where the first *body* line will land: bodyStartY.
  // Every body line after that just walks down by bodyLeading.

  function yForBodyLine(idx: number) {
    // idx = 0 => first body line => bodyStartY - (0 * bodyLeading)
    // idx = 1 => next body line  => bodyStartY - (1 * bodyLeading)
    return bodyStartY - (idx * bodyLeading);
  }

  // Which line is "Payment schedule..." in the body text?
  const schedIdx = lines.findIndex(l => l.text.startsWith("Payment schedule"));
  const scheduleBodyIdx = schedIdx === -1 ? 0 : schedIdx;
  const scheduleY = yForBodyLine(scheduleBodyIdx);

  // --- Stripe behind the schedule header ----------------
  // Add some horizontal + vertical padding so text doesn't kiss the edges.
  const stripePadX   = 4;
  const stripePadY   = 4;
  const stripeY      = scheduleY - stripePadY;           // a hair above the baseline
  const stripeH      = bodyLeading + stripePadY * 2;     // taller than one line
  const stripeX      = startX - stripePadX;              // extend a little left
  const stripeW      = (maxX - startX) + stripePadX * 2; // extend a little right

  // --- Divider line position ----------------------------
  // We want a subtle rule under the header block, not through it.
  // Let's put it halfway between the date line baseline and the first body line.
  //
  // The date line baseline is: startY - headerLeading
  // The spacer "gap" baseline for body is: bodyStartY + bodyLeading
  //   (Why + bodyLeading? Because bodyStartY is after we already consumed that spacer.)
  //
  // Simpler: just drop the rule at bodyStartY + (bodyLeading * 0.5)
  // i.e. halfway up into the spacer, feels like "under the header"
  const ruleY = bodyStartY;

  // Build the body text block:
  const bodyTextOps = [
    "/F1 12 Tf", // switch to body font
    // Move to the first body line baseline relative to where headerOps left us.
    // After headerOps we are ALREADY positioned at bodyStartY, so we do NOT need
    // an extra absolute move here. We just start emitting text lines.
    ...lines.map(({ text }) =>
      `(${escapePdfText(clampLen(text))}) Tj 0 -${bodyLeading} Td`
    ),
  ].join("\n");

  // Now assemble the full drawing stream.
  // NOTE: we no longer hardcode '728' etc. Everything is computed.
  const stream = `
    q
    0.9 g 0 G
    ${stripeX} ${stripeY} ${stripeW} ${stripeH} re f   % background stripe behind schedule header
    Q
    BT
    /F2 18 Tf
    ${startX} ${startY} Td
    ${headerOps}
    ${bodyTextOps}
    ET
    q
    0 g 0.6 G 0.5 w
    ${startX} ${ruleY} m ${maxX} ${ruleY} l S
    Q
  `;

  const streamBytes = enc.encode(stream);
  addObj(4, `<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream`);

  /* ------ END OF STREAM CONTENTS ------ */

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
