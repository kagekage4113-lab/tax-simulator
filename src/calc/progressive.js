// 速算表方式: 税額 = 課税所得 × 税率 − 控除額（該当する区分の値）。upTo は「その金額以下」、最後は null。
export function calcProgressive(taxable, brackets) {
  if (!(taxable > 0)) return 0;
  for (const b of brackets) {
    if (b.upTo == null || taxable <= b.upTo) return Math.max(0, Math.floor(taxable * b.rate) - b.deduction);
  }
  throw new Error('税率区分の最後は upTo: null が必要です');
}

// 金額の段階表 [{upTo, amount}] から該当する金額を返す（基礎控除など）
export function lookupStep(value, steps) {
  for (const s of steps) if (s.upTo == null || value <= s.upTo) return s.amount;
  throw new Error('段階表の最後は upTo: null が必要です');
}
