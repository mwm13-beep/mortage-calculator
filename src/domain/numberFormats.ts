// src/domain/numberFormats.ts
export type Rounding = "half-up" | "bankers";

/** Deterministic rounding to N decimals using decimal integers to avoid FP drift */
function roundTo(value: number, decimals: number, mode: Rounding = "half-up"): number {
  const factor = 10 ** decimals;
  const x = value * factor;
  if (mode === "bankers") {
    // Round half to even
    const floor = Math.floor(x);
    const frac = x - floor;
    if (frac > 0.5) return Math.ceil(x) / factor;
    if (frac < 0.5) return Math.floor(x) / factor;
    // exactly .5 -> to even
    return (floor % 2 === 0 ? floor : floor + 1) / factor;
  }
  // half-up
  return Math.round(x) / factor;
}

export const toCents = (dollars: number, mode: Rounding = "half-up"): number =>
  Math.round(roundTo(dollars, 2, mode) * 100);

export const fromCents = (cents: number): number => cents / 100;

/** Thousandths of a percent (milli-percent). 5.125% -> 5125 */
export const toMilliPercent = (pct: number, mode: Rounding = "half-up"): number =>
  Math.round(roundTo(pct, 3, mode) * 1000);

export const fromMilliPercent = (mp: number): number => mp / 1000;
