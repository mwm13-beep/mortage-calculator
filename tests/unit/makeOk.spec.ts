import { describe, it, expect } from "vitest";
import { computeWithDerived } from "../../src/engine";
import { makeOk } from "../../src/schemas/responseFactory";

describe("unit:makeOk wire shape with CA-default", () => {
  it("is stable and contains expected fields", () => {
    const r = computeWithDerived({
      rulesetCode: "CA-default",
      loanAmount: 500000, downPayment: 100000,
      rate: 5.25, term: 5, amortization: 25,
      firstTimeBuyer: false, newBuild: false
    });
    const ok = makeOk(r);
    expect(ok).toMatchObject({
      payment: expect.any(Number),
      amortization: expect.any(Number),
      breakdown: {
        principal: expect.any(Number),
        paymentsPerYear: 12,
        totalPayments: 300
      }
    });
    expect(ok).toHaveProperty("derived");
    expect(ok.derived.insured).toEqual(false);
    expect(ok.payment).toBe(2396.99); // swap to your known-good
  });
});
