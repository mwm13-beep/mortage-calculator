import { escapePdfText, clampLen, moneyStr } from "./templateUtils";
import type { ResponseOk } from "../schemas/responseFactory";
import type { RulesetCode } from "../rulesets";

// Render the whole page as text operators.
export function renderMortgagePdf(
  ok: ResponseOk,
  jurisdiction: RulesetCode,
  now = new Date()
): Uint8Array {

  //
  // ─────────────────────────────────────────
  // 1. Build semantic content lines ("Inputs:", "Payment schedule", etc.)
  //    We don't worry about fonts yet. Just text lines in order.
  // ─────────────────────────────────────────
  //

  const lines: Array<{ text: string }> = [];

  const push = (t: string) => {
    lines.push({ text: t });
  };

  // Inputs
  push("Inputs:");
  push(`  Principal (P): ${ok.breakdown.principal}`);
  push(`  Annual interest rate:   ${ok.breakdown.annualRatePercent}`);
  push(`  Payments per year: ${ok.breakdown.paymentsPerYear}`);
  push(`  Amortization: ${ok.amortization} yrs`);
  push("");

  // Results
  push("Results:");
  push(`  Annual interest rate / Payments per year = Monthly interest rate (r): ${ok.breakdown.monthlyRateDecimal} (as decimal)`);
  push(`  Payments per year * Amortization = Total payments (n): ${ok.breakdown.totalPayments}`);
  push(`  P · r / (1 − (1 + r) − n) = Monthly Payment of ${ok.payment}`);
  if (typeof ok.derived?.insured === "boolean") {
    push(`  Insured: ${ok.derived.insured ? "Yes (CMHC)" : "No"}`);
  }
  push("");

  //
  // Payment schedule section (first 12 + last 12)
  //

  const i = ok.breakdown.monthlyRateDecimal;
  const n = ok.breakdown.totalPayments;
  const P = ok.breakdown.principal;
  const A = ok.payment;

  // balance after k payments
  function balanceAfter(k: number) {
    const g = Math.pow(1 + i, k);
    return P * g - A * ((g - 1) / i);
  }

  // Column layout: we will print this block in monospace (Courier)
  // so padding will visually align.
  const COLS = {
    num: 4,
    bal: 12,
    int: 11,
    prin: 11,
    pay: 11,
  };

  // Make a fixed-width column string.
  // We'll right-align numeric columns (padStart) so money lines up by least significant digit,
  // which is normal for finance tables.
  function col(val: string | number, w: number) {
    const s = String(val);
    return s.length >= w ? s.slice(0, w) : s.padStart(w, " ");
  }

  function rowLine(k: number) {
    // row k (1-indexed): amounts paid on the k-th payment
    const balBefore = balanceAfter(k - 1);
    const interest = balBefore * i;
    const principalPaid = A - interest;
    const balAfter = Math.max(0, balBefore - principalPaid);

    const balS = moneyStr(balAfter);
    const intS = moneyStr(interest);
    const ppS  = moneyStr(principalPaid);
    const payS = moneyStr(A);

    return (
      col(k,          COLS.num)  +
      col(balS,       COLS.bal)  +
      col(intS,       COLS.int)  +
      col(ppS,        COLS.prin) +
      col(payS,       COLS.pay)
    );
  }

  const FIRST_COUNT = Math.min(12, n);
  const LAST_COUNT =
    n - FIRST_COUNT > 0
      ? Math.min(12, n - FIRST_COUNT)
      : 0;

  push(`Payment schedule (first ${FIRST_COUNT} + last ${LAST_COUNT}):`);
  push("");

  // Schedule table header
  push(
    col("#",        COLS.num)  +
    col("Balance",  COLS.bal)  +
    col("Interest", COLS.int)  +
    col("Principal",COLS.prin) +
    col("Payment",  COLS.pay)
  );

  // first block
  for (let k = 1; k <= FIRST_COUNT; k++) {
    push(rowLine(k));
  }

  // ellipsis if skipping the middle
  if (LAST_COUNT > 0 && n > FIRST_COUNT + LAST_COUNT) {
    push("  ...");
  }

  // last block
  if (LAST_COUNT > 0) {
    const startLast = n - LAST_COUNT + 1;
    for (let k = startLast; k <= n; k++) {
      push(rowLine(k));
    }
  }

  push("");

  // Footer
  push("Demo PDF — not for official use.");

  //
  // ─────────────────────────────────────────
  // 2. Layout math for PDF rendering
  //    (positions, stripe, rule, etc.)
  // ─────────────────────────────────────────
  //

  // visual constants
  const bodyLeading   = 14; // spacing per body line (12pt font)
  const headerLeading = 20; // spacing per header line (18pt font)
  const startX        = 50;
  const maxX          = 545;
  const startY        = 780;

  // Build header text ops (title + date + spacer)
  function buildHeaderOps() {
    // We output:
    //   (Mortgage Breakdown ...) Tj 0 -20 Td
    //   (2025-10-26)             Tj 0 -20 Td
    //   0 -14 Td   <- spacer line
    //
    // After that spacer, the "current text position" will be our bodyStartY.
    const headerOps = [
      `(Mortgage Breakdown    ${jurisdiction || ""}) Tj 0 -${headerLeading} Td`,
      `(${now.toISOString().slice(0,10)}) Tj 0 -${headerLeading} Td`,
      `0 -${bodyLeading} Td`,
    ].join("\n");

    // Calculate bodyStartY = where first body line baseline sits.
    const bodyStartY = (
      startY
      - headerLeading
      - headerLeading
      - bodyLeading
    );

    return { headerOps, bodyStartY };
  }

  const { headerOps, bodyStartY } = buildHeaderOps();

  // Find where "Payment schedule" starts in the body
  const schedIdx = lines.findIndex(l =>
    l.text.startsWith("Payment schedule")
  );
  const scheduleBodyIdx = schedIdx === -1 ? 0 : schedIdx + 1; // line after table title

  // Find where "Demo PDF" starts in the body
  const demoLineIdx = lines.findIndex(l =>
    l.text.startsWith("Demo PDF")
  );

  // Horizontal rule under the big header,
  // sitting in the gap above first body line.
  const ruleY = bodyStartY + bodyLeading * 1.75;

  //
  // ─────────────────────────────────────────
  // 3. Build the text drawing ops for body content
  //    We split the body lines into:
  //      - before schedule  (Helvetica /F1)
  //      - schedule+after   (Courier   /Fmono)
  // ─────────────────────────────────────────
  //

  const beforeSchedule = lines.slice(0, scheduleBodyIdx);
  const scheduleAndAfter = lines.slice(scheduleBodyIdx, demoLineIdx);
  const demoAndAfter = lines.slice(demoLineIdx);

  // helper: generate a block that:
  //   - sets font
  //   - emits each line as "(text) Tj 0 -leading Td"
  function buildLinesBlock(
    fontRef: string,
    fontSize: number,
    arr: { text: string }[]
  ) {
    const header = `${fontRef} ${fontSize} Tf`;
    const bodyOps = arr.map(({ text }) =>
      `(${escapePdfText(clampLen(text))}) Tj 0 -${bodyLeading} Td`
    );
    return [header, ...bodyOps].join("\n");
  }

  // Combine both blocks into the final flow
  const bodyTextOps = [
    buildLinesBlock("/F1",    12, beforeSchedule),   // Helvetica
    buildLinesBlock("/Fmono", 12, scheduleAndAfter), // Courier (monospace)
    buildLinesBlock("/F1",    12, demoAndAfter),     // Helvetica
  ].join("\n");

  //
  // ─────────────────────────────────────────
  // 4. Build the PDF stream with drawing commands
  //    (stripe rectangle, header text, body text, horizontal rule)
  // ─────────────────────────────────────────
  //

  const stream = `
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

  //
  // ─────────────────────────────────────────
  // 5. Emit full PDF file objects dynamically
  // ─────────────────────────────────────────
  //

  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let off = 0;

  function emit(s: string) {
    const b = enc.encode(s);
    chunks.push(b);
    off += b.length;
  }

  // We'll keep a registry of objects so we can:
  // 1) assign them stable IDs,
  // 2) reference them when building other objects,
  // 3) later emit them + build xref.
  type PdfObject = { id: number; body: string };
  const objects: PdfObject[] = [];
  let nextId = 1;
  function makeId() {
    return nextId++;
  }
  function addObjBody(id: number, body: string) {
    objects.push({ id, body });
  }

  // Pre-assign IDs so we can reference them
  const catalogId = makeId();   // /Catalog
  const pagesId   = makeId();   // /Pages
  const contentsId= makeId();   // stream with drawing
  const fontF1Id  = makeId();   // Helvetica
  const fontF2Id  = makeId();   // Helvetica-Bold
  const fontMonoId= makeId();   // Courier
  const pageId    = makeId();   // /Page

  // Build objects USING those IDs

  // Catalog
  addObjBody(
    catalogId,
    `<< /Type /Catalog /Pages ${pagesId} 0 R >>`
  );

  // Pages
  addObjBody(
    pagesId,
    `<< /Type /Pages /Count 1 /Kids [${pageId} 0 R] >>`
  );

  // Page content stream
  const streamBytes = enc.encode(stream);
  addObjBody(
    contentsId,
    `<< /Length ${streamBytes.length} >>\nstream\n${stream}\nendstream`
  );

  // Fonts
  addObjBody(
    fontF1Id,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`
  );
  addObjBody(
    fontF2Id,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`
  );
  addObjBody(
    fontMonoId,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>`
  );

  // Page
  addObjBody(
    pageId,
    `<< /Type /Page
        /Parent ${pagesId} 0 R
        /MediaBox [0 0 595 842]
        /Contents ${contentsId} 0 R
        /Resources << /Font <<
          /F1 ${fontF1Id} 0 R
          /F2 ${fontF2Id} 0 R
          /Fmono ${fontMonoId} 0 R
        >> >>
      >>`
  );

  //
  // ─────────────────────────────────────────
  // 6. Write the actual PDF:
  //    header, then each object in order,
  //    then xref, trailer, EOF.
  // ─────────────────────────────────────────
  //

  // We'll now emit the file in a single forward pass
  // and record offsets for xref.
  const xref: Record<number, number> = {};

  emit("%PDF-1.4\n");

  for (const { id, body } of objects) {
    xref[id] = off;
    emit(`${id} 0 obj\n${body}\nendobj\n`);
  }

  // build xref section
  const xrefStart = off;
  const maxId = Math.max(...objects.map(o => o.id));
  // Per PDF spec: xref section declares a range "0 <maxId+1>"
  emit(`xref\n0 ${maxId + 1}\n`);
  // entry for object 0 (free)
  emit(`0000000000 65535 f \n`);
  // entries for objects 1..maxId
  for (let id = 1; id <= maxId; id++) {
    const pos = String(xref[id] ?? 0).padStart(10, "0");
    emit(`${pos} 00000 n \n`);
  }

  // trailer
  emit(
    `trailer << /Size ${maxId + 1} /Root ${catalogId} 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF`
  );

  //
  // ─────────────────────────────────────────
  // 7. Concatenate chunks into final Uint8Array
  // ─────────────────────────────────────────
  //
  const totalLen = chunks.reduce((sum, b) => sum + b.length, 0);
  const out = new Uint8Array(totalLen);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

