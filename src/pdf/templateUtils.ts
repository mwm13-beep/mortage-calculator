// Escape only what's needed for PDF text streams.
export function escapePdfText(s: string): string {
  return String(s).replace(/([()\\])/g, "\\$1");
}

// Clamp length to avoid blowing up the PDF with unbounded strings.
export function clampLen(s: string, max = 120): string {
  const str = String(s);
  return str.length <= max ? str : str.slice(0, max - 1) + "…";
}

// Formatters — keep deterministic (no locale) to ensure testable output.
export const fm = {
  money(n: number) { return `$${n.toFixed(2)}`; },
  pct(n: number)   { return `${n.toFixed(3)}%`; },
};
