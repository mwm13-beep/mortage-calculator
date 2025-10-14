const res = await fetch("http://localhost:3000/api/mortgage", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    rulesetCode: "CA-default",
    loanAmount: 600000,
    downPayment: 180000,
    rate: 5.49,
    term: 5,
    amortization: 25,
    firstTimeBuyer: false,
    newBuild: false,
  }),
});
console.log(res.status, res.statusText);
const text = await res.text();
try { console.log(JSON.parse(text)); } catch { console.log(text); }
