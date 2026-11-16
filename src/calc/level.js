// 「いまの位置」と「次のレベル」: 税率の区分と、控除を増やしたときの得を、エンジンの結果から求める。
// 画面に依存しない。税額の計算そのものはエンジンに任せ、ここは見せ方に必要な数だけを組み立てる。
import { calculate } from './engine.js';

const clone = (s) => JSON.parse(JSON.stringify(s));

// 所得控除（その他の所得控除に加える）を増やしたときに、税金（所得税＋住民税）がいくら減るか。
export function savingByDeduction(state, rules, amount) {
  const before = calculate(state, rules);
  if (before.burden === null) return null;
  const s = clone(state);
  s.deductions.otherIncomeDeduction.amount = (s.deductions.otherIncomeDeduction.amount || 0) + amount;
  const after = calculate(s, rules);
  if (after.burden === null) return null;
  return {
    amount,
    total: before.burden - after.burden,
    incomeTax: before.incomeTax.total - after.incomeTax.total,
    residentTax: before.residentTax.total - after.residentTax.total,
  };
}

// 所得税の税率区分での、いまの位置と次の区分。
export function levelInfo(state, rules, r = calculate(state, rules)) {
  if (r.burden === null || !r.taxable.incomeTax || !r.taxable.residentTax) return null;
  const brackets = rules.incomeTax?.brackets;
  const recon = rules.incomeTax?.reconstructionRate ?? 0;
  const rtRate = rules.residentTax?.incomeRate;
  if (!brackets || rtRate == null) return null;
  const comp = r.taxable.incomeTax.comprehensive;
  const idx = comp > 0 ? brackets.findIndex((b) => b.upTo == null || comp <= b.upTo) : -1;
  const cur = idx >= 0 ? brackets[idx] : null;
  const next = brackets[idx + 1] || null;
  // 1万円 所得が増えたときの税金（所得税＋住民税。社会保険料は含めない）の目安
  const perMan = (rate) => Math.round(10_000 * (rate * (1 + recon) + rtRate));
  return {
    taxable: comp,
    rate: cur ? cur.rate : 0,
    nextRate: next ? next.rate : null,
    residentRate: rtRate,
    // 次の区分に入るまでの課税所得（税金がまだ0円のときは、課税が始まるまでの控除の余り）
    toNext: cur ? (cur.upTo == null ? null : cur.upTo - comp) : r.taxable.incomeTax.unusedDeduction,
    nextThreshold: cur ? cur.upTo : 0,
    nowPerMan: perMan(cur ? cur.rate : 0),
    nextPerMan: next ? perMan(next.rate) : null,
    top: !!cur && cur.upTo == null,
    untaxed: !cur,
  };
}
