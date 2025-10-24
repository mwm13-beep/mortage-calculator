// tests/unit/rounding.spec.ts
import { describe, it, expect } from "vitest";
import { makeRounding } from "../../src/engine/rounding";

// helpers to build policies quickly
const policy = (moneyDecimals: number, moneyMode: "half-up" | "bankers",
                rateDecimals = 3, rateMode: "half-up" | "bankers" = moneyMode) => ({
  moneyDecimals, moneyMode, rateDecimals, rateMode
});

describe("rounding modes", () => {
  describe("money: 2 decimals", () => {
    const half = makeRounding(policy(2, "half-up"));
    const even = makeRounding(policy(2, "bankers"));

    it("half-up rounds .005 away from zero", () => {
      expect(half.money(1.005)).toBe(1.01);
      expect(half.money(-1.005)).toBe(-1.01);
    });

    it("bankers rounds .005 to nearest even", () => {
      expect(even.money(1.005)).toBe(1.00);   // 1.00 (even at 2 dp)
      expect(even.money(1.015)).toBe(1.02);   // not a tie at kept digit (becomes up)
      expect(even.money(-1.005)).toBe(-1.00); // tie to even toward zero
    });

    it("non-tie behaves like nearest for both modes", () => {
      expect(half.money(1.0049)).toBe(1.00);
      expect(even.money(1.0049)).toBe(1.00);
      expect(half.money(1.0061)).toBe(1.01);
      expect(even.money(1.0061)).toBe(1.01);
    });
  });

  describe("money: 0 decimals", () => {
    const half0 = makeRounding(policy(0, "half-up"));
    const even0 = makeRounding(policy(0, "bankers"));

    it("half-up at 0dp", () => {
      expect(half0.money(2.5)).toBe(3);
      expect(half0.money(3.5)).toBe(4);
      expect(half0.money(-2.5)).toBe(-3);
    });

    it("bankers at 0dp (ties to even)", () => {
      expect(even0.money(2.5)).toBe(2);   // even
      expect(even0.money(3.5)).toBe(4);   // even
      expect(even0.money(-2.5)).toBe(-2); // even toward zero
    });
  });

  describe("rate rounding: 3 decimals", () => {
    const half = makeRounding(policy(2, "half-up", 3, "half-up"));
    const even = makeRounding(policy(2, "bankers", 3, "bankers"));

    it("half-up .5 at 3dp goes up", () => {
      expect(half.ratePct(3.445)).toBe(3.445); // already at 3dp
      expect(half.ratePct(3.4454)).toBe(3.445);
      expect(half.ratePct(3.4455)).toBe(3.446); // half-up
    });

    it("bankers .5 at 3dp goes to even", () => {
      // 3.445 is a tie at the 3rd dp; '4' (the 3rd dp) is even -> stays 3.445
      expect(even.ratePct(3.445)).toBe(3.445);
      // 3.435 is tie; '3' (the 3rd dp) is odd -> rounds to 3.434 (even at 3dp becomes .434? No: it rounds the 3rd digit)
      // Correct expectations:
      // 3.435 at 3dp ties between 3.435 and 3.435; even rule keeps the 3rd digit even (3.434 vs 3.436 are the neighbours).
      // decimal.js applies HALF_EVEN at the rounding digit:
      expect(even.ratePct(3.435)).toBe(3.435); // because the 3rd digit (5 tie) keeps previous digit (3) even rule chooses 3.435 → 3.435 (no change)
      // Safer demonstration with an explicit 4th digit:
      expect(even.ratePct(3.4445)).toBe(3.444); // tie at the 4th -> 3rd stays even (4)
      expect(even.ratePct(3.4455)).toBe(3.446); // not a tie, normal up
    });
  });

  describe("annualPctToPeriodicDecimal has no policy bias", () => {
    const half = makeRounding(policy(2, "half-up"));
    const even = makeRounding(policy(2, "bankers"));

    it("produces same periodic rate for both modes", () => {
      const r1 = half.annualPctToPeriodicDecimal(5.25, 12);
      const r2 = even.annualPctToPeriodicDecimal(5.25, 12);
      expect(r1).toBeCloseTo(r2, 12);
    });
  });
});
