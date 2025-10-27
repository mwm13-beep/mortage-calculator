import { describe, it, expect } from "vitest";
import { computeWithDerived } from "../../src/engine";
import { createSchemaForRuleset } from "../../src/schemas/requestFactory";

describe("unit:ca plugin", () => {
    const schema = createSchemaForRuleset("CA-Default");

    it("flags insured when LTV > 80% and caps amortization at 25", () => {
    const input = schema.parse({
        rulesetCode: "CA-Default",
        loanAmount: 500000, downPayment: 50000,
        rate: 5.25, term: 5, amortization: 35,
        firstTimeBuyer: false, newBuild: false
    });
    const r = computeWithDerived(input);
    expect(r.derived.insured).toBe(true);
    // insured → capped at 25 yrs
    expect(r.totalPayments).toBe(25 * 12);
    });

    it("flags uninsured when LTV <= 80% and caps amortization at 30", () => {
        const input = schema.parse({
            rulesetCode: "CA-Default",
            loanAmount: 500000, downPayment: 100000,
            rate: 5.25, term: 5, amortization: 35,
            firstTimeBuyer: false, newBuild: false
        });
        const r = computeWithDerived(input);
        expect(r.derived.insured).toBe(false);
        // insured → capped at 30 yrs
        expect(r.totalPayments).toBe(30 * 12);
    });
    it("flags insured when LTV > 80% and caps amortization at 30 when first-time buyer and new build are set.", () => {
        const input = schema.parse({
            rulesetCode: "CA-Default",
            loanAmount: 500000, downPayment: 50000,
            rate: 5.25, term: 5, amortization: 35,
            firstTimeBuyer: true, newBuild: true
        });
        const r = computeWithDerived(input);
        expect(r.derived.insured).toBe(true);
        // insured → capped at 30 yrs
        expect(r.totalPayments).toBe(30 * 12);
    });
});
