// 「いまの状況」: 指定した種類の収入（FXなど）があと何円増えても、どの税・制度の状態が変わらないか。
// 追加収入を 0 から増やしながら calculate() を呼び、状態が最初に変わる直前の額を二分探索で求める（1,000円単位・切り捨て）。
// 判定ロジックは持たず、エンジンの結果（税額・非課税の判定・国保の軽減・申告要否）をそのまま読む。
import { calculate } from './engine.js';
import { withIncomeAdded } from './simulate.js';

const CAP = 50_000_000;
const UNIT = 1000;

// pred(result) が最初に真になる直前の追加額。すでに真なら 0 を返し already: true。CAP までに真にならなければ never: true。
function marginUntil(state, rules, target, pred, base) {
  const at = (add) => pred(add === 0 ? base : calculate(withIncomeAdded(state, target, add), rules));
  if (at(0)) return { already: true, margin: 0 };
  let hi = 100_000;
  while (hi < CAP && !at(hi)) hi *= 2;
  if (!at(hi)) return { never: true, margin: null };
  let lo = hi === 100_000 ? 0 : hi / 2;
  while (hi - lo > UNIT) {
    const mid = lo + Math.floor((hi - lo) / 2 / UNIT) * UNIT || lo + UNIT;
    if (at(mid)) hi = mid; else lo = mid;
  }
  return { margin: lo };
}

export const SITUATION_TARGETS = {
  fx: { category: 'fx', label: 'FX・先物の利益' },
  listedStock: { category: 'listedStock', label: '上場株式等の利益' },
  misc: { category: 'misc', label: '雑所得（副業など）の利益' },
};

export function situation(state, rules, targetId = 'fx') {
  const target = { category: SITUATION_TARGETS[targetId].category };
  const base = calculate(state, rules);
  const ok = base.burden !== null && base.takeHome !== null;
  const tax = (r) => r.incomeTax?.total ?? null;
  const out = {
    ok,
    base: {
      totalIncome: base.income.total,
      incomeTax: tax(base),
      residentTax: base.residentTax?.total ?? null,
      exemption: base.residentTax?.exemption ?? null,
      unusedIT: base.taxable.incomeTax?.unusedDeduction ?? null,
      unusedRT: base.taxable.residentTax?.unusedDeduction ?? null,
    },
    marks: [],
  };
  if (!ok) return out;

  const baseRate = base.socialInsurance.kokuho?.rate ?? null;
  const defs = [
    { id: 'incomeTax', pred: (r) => r.incomeTax !== null && r.incomeTax.total > 0 },
    { id: 'residentLevy', pred: (r) => r.residentTax !== null && r.residentTax.incomeLevy + r.residentTax.fxTax + r.residentTax.listedTax > 0 },
    { id: 'residentNonTaxable', pred: (r) => r.residentTax !== null && r.residentTax.exemption !== 'all' && base.residentTax?.exemption === 'all' },
    { id: 'residentLevyNonTaxable', pred: (r) => r.residentTax !== null && r.residentTax.exemption === null && base.residentTax?.exemption !== null },
    ...(base.socialInsurance.kokuho ? [{ id: 'kokuhoReduction', pred: (r) => r.socialInsurance.kokuho && r.socialInsurance.kokuho.rate !== baseRate }] : []),
    ...(base.filing ? [{ id: 'filing', pred: (r) => r.filing && r.filing.status === 'required' }] : []),
  ];
  for (const d of defs) {
    const m = marginUntil(state, rules, target, d.pred, base);
    const at = m.margin === null ? null : calculate(withIncomeAdded(state, target, m.margin), rules);
    out.marks.push({ id: d.id, ...m, totalIncomeAtMargin: at ? at.income.total : null });
  }
  return out;
}
