export type CmhcBands = Array<{ maxLTV: number; pct: number }>;

export function cmhcPremium(loanAmount: number, downPayment: number, bands: CmhcBands) {
  const ltv = loanAmount > 0 ? (loanAmount - downPayment) / loanAmount : 0;
  const band = bands.find(b => ltv <= b.maxLTV) ?? bands[bands.length - 1];
  return { ltv, pct: band.pct, premium: loanAmount * band.pct };
}