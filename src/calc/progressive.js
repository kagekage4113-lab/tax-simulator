// 速算表方式: 税額 = 課税所得 × 税率 − 控除額（該当する区分の値）。upTo は「その金額以下」。
// 最後の区分が upTo: null でない表は「その金額までしか資料がない」ことを表し、超える入力には null を返す（推測しない）。
export function calcProgressive(taxable, brackets) {
  if (!(taxable > 0)) return 0;
  for (const b of brackets) {
    if (b.upTo == null || taxable <= b.upTo) return Math.max(0, Math.floor(taxable * b.rate) - b.deduction);
  }
  return null;
}

// 金額の段階表 [{upTo, amount}] から該当する金額を返す。範囲外は null。
export function lookupStep(value, steps) {
  for (const s of steps) if (s.upTo == null || value <= s.upTo) return s.amount;
  return null;
}
