// シミュレーション（フェーズ3）。現在の入力（state）は変更せず、複製した状態を calculate() で再計算して比較する。
import { calculate } from './engine.js';
import { wallDefinitions } from './walls.js';
import { getIncomeCategory } from '../data/incomeCategories.js';
import { newIncome } from '../core/schema.js';

const clone = (s) => JSON.parse(JSON.stringify(s));

// target: { id } 既存の収入 / { category } 新しい収入として追加
export function withIncomeAdded(state, target, add, extraExpenses = 0) {
  const s = clone(state);
  let inc = target.id ? s.incomes.find((i) => i.id === target.id) : null;
  if (!inc) {
    inc = newIncome(target.category || 'misc');
    if (target.businessType) inc.businessType = target.businessType;
    s.incomes.push(inc);
  }
  inc.amount += add;
  if (getIncomeCategory(inc.category).hasExpenses) inc.expenses += extraExpenses;
  return s;
}

export function withExpenseChanged(state, targetId, delta) {
  const s = clone(state);
  const inc = s.incomes.find((i) => i.id === targetId);
  if (inc) inc.expenses = Math.max(0, inc.expenses + delta);
  return s;
}

// 比較表に出す指標。税制データ不足などで確定できない場合は null。
export function metricsOf(r) {
  const ok = r.burden !== null && r.takeHome !== null;
  return {
    ok,
    revenue: r.income.revenueTotal + r.income.fx.profit + r.income.simpleComp,
    income: r.income.total,
    incomeTax: ok ? r.incomeTax.total : null,
    residentTax: ok ? r.residentTax.total : null,
    businessTax: ok ? r.businessTax.total : null,
    socialInsurance: ok ? r.socialInsurance.total : null,
    burden: r.burden,
    takeHome: r.takeHome,
  };
}

const diffOf = (a, b) => Object.fromEntries(Object.keys(a).filter((k) => k !== 'ok').map((k) => [k, a[k] === null || b[k] === null ? null : b[k] - a[k]]));

// 追加収入の比較（6.1・6.3）。限界負担率 = 追加負担額 ÷ 追加収入額 × 100。追加収入が0なら null。
export function compareIncome(state, rules, { target, add, extraExpenses = 0 }) {
  const before = calculate(state, rules);
  const after = calculate(withIncomeAdded(state, target, add, extraExpenses), rules);
  const mb = metricsOf(before);
  const ma = metricsOf(after);
  const diff = diffOf(mb, ma);
  const available = mb.ok && ma.ok;
  const marginalRate = available && add !== 0 ? (diff.burden / add) * 100 : null;
  const notes = [...new Set([...before.notes, ...after.notes])];
  if (available && before.socialInsurance.mode === 'actual') notes.push('社会保険料は実額入力のため、追加収入による保険料の増減は含めていません。');
  return { before, after, mb, ma, diff, available, marginalRate, notes, missing: after.missing };
}

// 経費の変更（6.2）。経費の増加は「支出」と「税負担の減少」を分けて返す（手元に残るお金 = −支出 + 税負担の減少）。
export function compareExpense(state, rules, { targetId, delta }) {
  const before = calculate(state, rules);
  const after = calculate(withExpenseChanged(state, targetId, delta), rules);
  const mb = metricsOf(before);
  const ma = metricsOf(after);
  const available = mb.ok && ma.ok;
  const inc = state.incomes.find((i) => i.id === targetId);
  const applied = inc ? Math.max(0, inc.expenses + delta) - inc.expenses : 0; // 0未満にならないよう丸めた実際の変化額
  const taxChange = available ? ma.burden - mb.burden : null; // 負 = 税負担が減る
  return { before, after, mb, ma, diff: diffOf(mb, ma), available, applied, taxChange, cashChange: available ? ma.takeHome - mb.takeHome : null, notes: [...new Set([...before.notes, ...after.notes])] };
}

// 追加収入を 0〜max まで増やしたときの負担・手取りの推移と、壁（条件の変わる境界）の位置（6.4）。
export function sweepIncome(state, rules, { target, max, step }) {
  const walls = wallDefinitions(state, rules);
  const points = [];
  for (let add = 0; add <= max; add += step) {
    const s = withIncomeAdded(state, target, add);
    const r = calculate(s, rules);
    const typedBusiness = s.incomes.filter((i) => i.category === 'business' && i.businessType !== 'unknown').reduce((a, i) => a + i.amount - i.expenses, 0);
    points.push({
      add,
      burden: r.burden,
      takeHome: r.takeHome,
      metrics: { totalIncome: r.income.total, taxableIT: r.taxable.incomeTax?.comprehensive ?? null, taxableRT: r.taxable.residentTax?.comprehensive ?? null, businessNet: typedBusiness, sideIncome: r.filing ? r.filing.sideIncome : null, householdIncome: r.socialInsurance.kokuho ? r.socialInsurance.kokuho.householdIncome : null },
    });
  }
  const ok = points.every((p) => p.takeHome !== null);
  const base = points[0];
  const out = points.map((p, i) => ({
    ...p,
    gain: ok ? p.takeHome - base.takeHome : null, // 追加収入による手取りの増加額
    marginal: ok && i > 0 ? (p.burden - points[i - 1].burden) / step : null, // この区間の限界負担率（0〜1）
  }));

  // 壁: 指標が threshold 以下 → 超えに変わる最初の区間。marginalAfter は、段差を含む区間の次の区間の傾き（段差は jump に分けて持つ）
  const crossed = walls.map((w) => {
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1].metrics[w.metric];
      const b = out[i].metrics[w.metric];
      if (a !== null && b !== null && a <= w.threshold && b > w.threshold) return { ...w, add: out[i].add, index: i, marginalBefore: out[i - 1].marginal, marginalAfter: out[i + 1] ? out[i + 1].marginal : null, jump: ok ? out[i].burden - out[i - 1].burden - (out[i - 1].marginal ?? 0) * step : null };
    }
    return null;
  }).filter(Boolean);
  const startedAbove = walls.filter((w) => out[0].metrics[w.metric] !== null && out[0].metrics[w.metric] > w.threshold).length;

  // 逆転: 収入が増えたのに手取りが減る区間
  const reversals = [];
  if (ok) {
    for (let i = 1; i < out.length; i++) {
      if (out[i].takeHome < out[i - 1].takeHome) {
        const last = reversals[reversals.length - 1];
        if (last && last.toIndex === i - 1) {
          last.toIndex = i;
          last.to = out[i].add;
          last.drop = out[last.fromIndex].takeHome - out[i].takeHome;
        } else reversals.push({ fromIndex: i - 1, toIndex: i, from: out[i - 1].add, to: out[i].add, drop: out[i - 1].takeHome - out[i].takeHome });
      }
    }
  }
  return { points: out, walls: crossed, startedAbove, reversals, ok, notes: calculate(state, rules).notes };
}

// FXの利確タイミング比較（6.5）。今年 realize 円・来年 (unrealized − realize) 円 を利確した場合の税負担。
// 来年は「今年と同じ収入・同じ税制」と仮定し、今年の繰越損失の残りを引き継ぐ。
export function fxTiming(state, rules, { unrealized, realize }) {
  const base = clone(state);
  const others = base.incomes.filter((i) => i.category !== 'fx');
  const fxNow = base.incomes.filter((i) => i.category === 'fx').reduce((a, i) => a + i.amount, 0);
  const stateWith = (taxYear, fxAmount, carry) => {
    const s = clone(state);
    s.taxYear = taxYear;
    s.incomes = others.map(clone);
    const f = newIncome('fx');
    f.amount = fxAmount;
    s.incomes.push(f);
    s.fxCarryLosses = carry;
    return s;
  };
  const evalR = (R) => {
    const thisYear = calculate(stateWith(state.taxYear, fxNow + R, state.fxCarryLosses), rules);
    const next = calculate(stateWith(state.taxYear + 1, unrealized - R, thisYear.income.fx.carryNext), rules);
    const ok = thisYear.burden !== null && next.burden !== null;
    return {
      realize: R,
      thisYear,
      next,
      ok,
      thisBurden: ok ? thisYear.burden : null,
      nextBurden: ok ? next.burden : null,
      totalBurden: ok ? thisYear.burden + next.burden : null,
      thisFxTax: ok ? (thisYear.incomeTax.fxTax) + (thisYear.residentTax.fxTax) : null, // 復興税を除くFX分の税（目安）
    };
  };
  const now = evalR(0); // 今年は追加で利確しない（来年に全額回す）
  const all = evalR(unrealized); // 今年全額
  // 税負担が最小になる利確額（1万円刻み。同額なら今年に多く利確する側を採用）
  let best = null;
  const step = 10_000;
  for (let R = unrealized; R >= 0; R -= step) {
    const e = evalR(R);
    if (e.ok && (best === null || e.totalBurden < best.totalBurden)) best = e;
  }
  const zero = best === null || best.realize !== 0 ? evalR(0) : best;
  if (zero.ok && (best === null || zero.totalBurden < best.totalBurden)) best = zero;
  const here = calculate(stateWith(state.taxYear, fxNow, state.fxCarryLosses), rules);
  return {
    now, all, best, evaluate: evalR,
    slack: here.taxable.incomeTax ? { incomeTax: here.taxable.incomeTax.unusedDeduction, residentTax: here.taxable.residentTax?.unusedDeduction ?? null } : null,
    carry: { used: here.income.fx.carryUsed, remaining: here.income.fx.carryRemaining },
  };
}
