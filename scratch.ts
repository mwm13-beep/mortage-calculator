import { createSchemaForRuleset } from "./src/schemas/schemaFactory";
const s = createSchemaForRuleset("CA-default");
console.log(s.safeParse({ loanAmount: 500000, rate: 5, term: 5, amortization: 25, downPayment: 100000, sneaky: 1 }).success); // -> false
console.log(s.safeParse({ loanAmount: 500000, rate: 5, term: 5, amortization: 25, downPayment: 600000 }).success); // -> false
console.log(s.safeParse({ loanAmount: 500000, rate: 5, term: 5, amortization: 25, downPayment: 100000 }).success); // -> true