// Escape only what's needed for PDF text streams.
export function escapePdfText(s: string): string {
  return String(s).replace(/([()\\])/g, "\\$1");
}

// Clamp length to avoid blowing up the PDF with unbounded strings.
export function clampLen(s: string, max = 120): string {
  const str = String(s);
  return str.length <= max ? str : str.slice(0, max - 1) + "…";
}

export function asStr(v: unknown): string {
  return String(v);
}

export function moneyStr(n: number, decimals = 2): string {
  return n.toFixed(decimals);        // display-only; no extra math
}