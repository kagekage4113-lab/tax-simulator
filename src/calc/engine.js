// 税額計算エンジン（画面に依存しない）。calculate(state, rules) → 結果オブジェクト。
//
// rules は年度別税制データ（src/data/taxYears/*.js）。値が null/未定義の項目は「データ未登録」として
// result.missing に記録し、その項目に依存する結果は null にする。推測値では計算しない。
//
// rules の形（フェーズ2a で使うもの）:
//   rounding: { taxableIncome, residentTaxableIncome, incomeTax, reconstruction, residentIncomeLevy, businessTax } 各 {rule,unit}
//   incomeTax: { brackets:[{upTo,rate,deduction}], reconstructionRate }
//   residentTax: { incomeRate, perCapita }
//   salaryDeduction: { brackets:[{upTo,rate,add}] }   // 控除額 = floor(給与収入×rate)+add
//   basicDeduction: { incomeTax:[{upTo,amount}], residentTax:[{upTo,amount}] }   // upTo は合計所得金額
//   medical: { thresholdFixed, thresholdRate, cap }
//   socialInsurance: { estimate: { <保険区分>: { rate, base:'salaryRevenue'|'totalIncome', fixed } } }
//   businessTax: { rate, mainDeduction }
//   fx: { incomeTaxRate, residentTaxRate }
import { applyRounding } from './rounding.js';
import { calcProgressive, lookupStep } from './progressive.js';
import { getIncomeCategory } from '../data/incomeCategories.js';
import { INCOME_DEDUCTIONS } from '../data/deductions.js';

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

export function calculate(state, rules) {
  const missing = new Set();
  const notes = [];
  const need = (path) => {
    const v = get(rules, path);
    if (v == null) { missing.add(path); return undefined; }
    return v;
  };
  const round = (value, key) => {
    const r = need(`rounding.${key}`);
    return r ? applyRounding(value, r) : undefined;
  };

  // ---- 1-3. 所得区分ごとの所得と損益通算 ----
  const sum = (cat, f) => state.incomes.filter((i) => i.category === cat).reduce((a, i) => a + f(i), 0);
  const salaryRevenue = sum('salary', (i) => i.amount);
  const businessNet = sum('business', (i) => i.amount - i.expenses);
  const businessRevenue = sum('business', (i) => i.amount);
  const realEstateNet = sum('realEstate', (i) => i.amount - i.expenses);
  const miscNet = sum('misc', (i) => i.amount - i.expenses);
  const expensesTotal = state.incomes.reduce((a, i) => a + (getIncomeCategory(i.category).hasExpenses ? i.expenses : 0), 0);
  const revenueTotal = state.incomes
    .filter((i) => ['salary', 'business', 'realEstate', 'misc'].includes(i.category))
    .reduce((a, i) => a + i.amount, 0);

  // 簡易扱い（未対応区分の直接入力所得）
  const simple = state.incomes.filter((i) => !getIncomeCategory(i.category).supported);
  const simpleComp = simple.filter((i) => i.taxMethod === 'comprehensive').reduce((a, i) => a + Math.max(0, i.amount), 0);
  const simpleSeparate = simple.filter((i) => i.taxMethod !== 'comprehensive').reduce((a, i) => a + i.amount, 0);
  if (simple.some((i) => i.taxMethod === 'comprehensive' && i.amount < 0)) notes.push('未対応区分の赤字は他の所得と通算せず0として扱っています（簡易扱い）。');
  if (simpleSeparate !== 0) notes.push('未対応区分の分離課税・源泉分離の所得は税額に含めていません（簡易扱い）。');

  // 給与所得
  let salaryIncome = 0;
  let salaryDeductionAmount = 0;
  if (salaryRevenue > 0) {
    const sd = need('salaryDeduction.brackets');
    if (sd) {
      const b = sd.find((x) => x.upTo == null || salaryRevenue <= x.upTo);
      salaryDeductionAmount = Math.floor(salaryRevenue * b.rate) + b.add;
      salaryIncome = Math.max(0, salaryRevenue - salaryDeductionAmount);
    } else salaryIncome = null;
  }

  // 事業所得（青色申告特別控除）
  let blueDeductionApplied = 0;
  let businessIncome = businessNet;
  if (state.filing.type === 'blue' && businessNet > 0) {
    blueDeductionApplied = Math.min(state.filing.blueDeduction * 10000, businessNet);
    businessIncome = businessNet - blueDeductionApplied;
  }
  if (state.filing.type === 'blue' && state.incomes.some((i) => i.category === 'realEstate')) {
    notes.push('不動産所得に対する青色申告特別控除（事業的規模の場合）は未対応です。');
  }

  // 雑所得の赤字は通算しない
  const miscIncome = Math.max(0, miscNet);
  const miscLossIgnored = miscNet < 0 ? -miscNet : 0;
  if (miscLossIgnored) notes.push('雑所得の赤字は他の所得と損益通算できないため、0として扱っています。');
  if (realEstateNet < 0) notes.push('不動産所得の赤字は原則通算していますが、土地等の取得に係る借入金利子など通算できない例外は自動判定しません。');

  const profitLossBlocks = [salaryIncome, businessIncome, realEstateNet, miscIncome, simpleComp];
  const comprehensiveRaw = profitLossBlocks.some((x) => x === null) ? null : profitLossBlocks.reduce((a, b) => a + b, 0);
  const comprehensiveIncome = comprehensiveRaw === null ? null : Math.max(0, comprehensiveRaw);
  const lossOffset = comprehensiveRaw !== null && comprehensiveRaw < 0 ? -comprehensiveRaw : 0;

  // ---- 4. FX（申告分離）----
  const fxProfit = sum('fx', (i) => i.amount);
  const carryIn = state.fxCarryForward;
  const fxCarryUsed = Math.min(carryIn, Math.max(0, fxProfit));
  const fxIncome = Math.max(0, fxProfit) - fxCarryUsed;
  const fxCarryRemaining = carryIn - fxCarryUsed + Math.max(0, -fxProfit);
  if (fxProfit < 0) notes.push('FXの損失は総合課税の所得と通算せず、翌年以降へ繰り越す額として計上しています。');

  const totalIncome = comprehensiveIncome === null ? null : comprehensiveIncome + fxIncome; // 合計所得金額（簡易）

  // ---- 5. 所得控除 ----
  const socialInsurance = calcSocialInsurance({ state, need, salaryRevenue, totalIncome });
  const deductions = calcDeductions({ state, rules, need, totalIncome, socialInsurance });

  if (deductions.pendingAuto.length) {
    const labels = deductions.pendingAuto.map((id) => INCOME_DEDUCTIONS.find((d) => d.id === id).label).join('、');
    notes.push(`${labels}の自動計算は未対応（フェーズ2b）のため、控除額0円として計算しています。`);
  }

  // ---- 6-7. 課税所得 ----
  const taxableFor = (kind) => {
    const ded = deductions[kind];
    const roundKey = kind === 'incomeTax' ? 'taxableIncome' : 'residentTaxableIncome';
    if (ded.total === null || comprehensiveIncome === null) return null;
    const comp = Math.max(0, comprehensiveIncome - ded.total);
    const spill = Math.max(0, ded.total - comprehensiveIncome); // 総合で引ききれない控除
    const fx = Math.max(0, fxIncome - spill);
    const rc = round(comp, roundKey);
    const rf = round(fx, roundKey);
    if (rc === undefined) return null;
    return { comprehensive: rc, fx: rf, spillToFx: Math.min(spill, fxIncome), unusedDeduction: Math.max(0, spill - fxIncome) };
  };
  const taxableIT = taxableFor('incomeTax');
  const taxableRT = taxableFor('residentTax');

  // ---- 8-11. 所得税 ----
  let incomeTax = null;
  if (taxableIT) {
    const brackets = need('incomeTax.brackets');
    const recRate = need('incomeTax.reconstructionRate');
    const fxRate = fxIncome > 0 ? need('fx.incomeTaxRate') : 0;
    if (brackets && recRate !== undefined && fxRate !== undefined) {
      const comp = calcProgressive(taxableIT.comprehensive, brackets);
      const fx = Math.floor(taxableIT.fx * fxRate);
      const credit = state.taxCredits.housingLoan.amount; // 所得税の税額控除（手入力）
      const base = Math.max(0, comp + fx - credit);
      const recon = round(base * recRate, 'reconstruction');
      const total = recon === undefined ? undefined : round(base + recon, 'incomeTax');
      if (total !== undefined) incomeTax = { comprehensiveTax: comp, fxTax: fx, credit, base, reconstruction: recon, total };
    }
  }

  // ---- 12. 住民税 ----
  let residentTax = null;
  if (taxableRT) {
    const rate = need('residentTax.incomeRate');
    const perCapita = need('residentTax.perCapita');
    const fxRate = fxIncome > 0 ? need('fx.residentTaxRate') : 0;
    if (rate !== undefined && perCapita !== undefined && fxRate !== undefined) {
      const levy = round(taxableRT.comprehensive * rate, 'residentIncomeLevy');
      const fx = Math.floor(taxableRT.fx * fxRate);
      const credit = state.taxCredits.donationCredit.amount;
      if (levy !== undefined) {
        const incomeLevy = Math.max(0, levy - credit);
        // 非課税判定・調整控除は未対応（概算）
        residentTax = { incomeLevy: incomeLevy, fxTax: fx, perCapita, credit, total: incomeLevy + fx + perCapita };
        notes.push('住民税は調整控除・非課税判定・自治体別の違いを反映していない概算です。');
      }
    }
  }

  // ---- 13. 個人事業税 ----
  const businessTax = calcBusinessTax({ state, need, round, businessNet });

  // ---- 手取り（7章の定義）----
  const taxesKnown = incomeTax && residentTax && businessTax.total !== null && socialInsurance.total !== null;
  const takeHome = taxesKnown
    ? revenueTotal - expensesTotal + simpleComp + fxProfit
      - incomeTax.total - residentTax.total - businessTax.total - socialInsurance.total
    : null;
  const burden = taxesKnown ? incomeTax.total + residentTax.total + businessTax.total + socialInsurance.total : null;

  // 途中で計算を打ち切っても、この入力で必要な未登録データを漏れなく列挙する。
  const required = [
    'incomeTax.brackets', 'incomeTax.reconstructionRate', 'residentTax.incomeRate', 'residentTax.perCapita',
    'basicDeduction.incomeTax', 'basicDeduction.residentTax',
    'rounding.taxableIncome', 'rounding.residentTaxableIncome', 'rounding.incomeTax', 'rounding.reconstruction', 'rounding.residentIncomeLevy',
  ];
  if (salaryRevenue > 0) required.push('salaryDeduction.brackets');
  if (fxIncome > 0) required.push('fx.incomeTaxRate', 'fx.residentTaxRate');
  if (state.incomes.some((i) => i.category === 'business' && i.businessType === 'general')) required.push('businessTax.rate', 'businessTax.mainDeduction', 'rounding.businessTax');
  if (state.insurance.actualAnnual == null && ['employee', 'national'].includes(state.insurance.type)) required.push(`socialInsurance.estimate.${state.insurance.type}`);
  required.forEach(need);

  return {
    year: state.taxYear,
    missing: [...missing].sort(),
    notes,
    income: {
      salaryRevenue, salaryDeduction: salaryDeductionAmount, salaryIncome,
      businessRevenue, businessNet, blueDeductionApplied, businessIncome,
      realEstateNet, miscNet, miscIncome, miscLossIgnored, simpleComp,
      comprehensiveRaw, lossOffset, comprehensive: comprehensiveIncome,
      fx: { profit: fxProfit, carryIn, carryUsed: fxCarryUsed, income: fxIncome, carryRemaining: fxCarryRemaining },
      total: totalIncome,
      revenueTotal, expensesTotal,
    },
    deductions,
    taxable: { incomeTax: taxableIT, residentTax: taxableRT },
    incomeTax, residentTax, businessTax, socialInsurance,
    burden, takeHome,
  };
}

function calcDeductions({ state, rules, need, totalIncome, socialInsurance: siFull }) {
  const out = { incomeTax: { items: [], total: 0 }, residentTax: { items: [], total: 0 } };
  const push = (kind, id, label, amount, mode) => {
    out[kind].items.push({ id, label, amount, mode });
    if (out[kind].total !== null) out[kind].total = amount === null ? null : out[kind].total + amount;
  };
  for (const kind of ['incomeTax', 'residentTax']) {
    // 基礎控除（自動）
    const steps = need(`basicDeduction.${kind}`);
    push(kind, 'basic', '基礎控除', steps && totalIncome !== null ? lookupStep(totalIncome, steps) : null, 'auto');
    // 社会保険料控除（自動: 実額 or 概算）
    push(kind, 'socialInsurance', '社会保険料控除', siFull.total, siFull.mode === 'actual' ? 'actual' : 'estimate');
    // 手入力の控除
    for (const [id, box] of Object.entries(state.deductions)) {
      const def = INCOME_DEDUCTIONS.find((d) => d.id === id);
      if (!def || !def.supported) continue;
      let amount;
      if (id === 'medical') {
        const m = rules.medical;
        if (box.paid - box.reimbursed <= 0) amount = 0;
        else if (!m || m.thresholdFixed == null || m.thresholdRate == null || m.cap == null) { need('medical'); amount = null; }
        else if (totalIncome === null) amount = null;
        else {
          const threshold = Math.min(m.thresholdFixed, Math.floor(totalIncome * m.thresholdRate));
          amount = Math.min(m.cap, Math.max(0, box.paid - box.reimbursed - threshold));
        }
      } else amount = box.amount;
      if (amount !== 0 || id !== 'medical') push(kind, id, def.label, amount, 'manual');
    }
    // 自動計算（フェーズ2b）で未実装の控除: 該当しうる条件があれば「データ未登録」として明示
    for (const id of pendingAuto(state)) {
      const def = INCOME_DEDUCTIONS.find((d) => d.id === id);
      push(kind, id, def.label, 0, 'pending');
    }
  }
  out.pendingAuto = pendingAuto(state);
  return out;
}

// 自動計算が未実装（2b）で、入力条件上は該当し得る控除
function pendingAuto(state) {
  const ids = [];
  if (state.spouse.exists) ids.push('spouse');
  if (state.dependents.length) ids.push('dependent');
  if (state.self.disability !== 'none' || state.spouse.disability !== 'none' || state.dependents.some((d) => d.disability !== 'none')) ids.push('disability');
  if (state.self.widowSingleParent !== 'none') ids.push('widowSingleParent');
  if (state.self.workingStudent) ids.push('workingStudent');
  return ids;
}

function calcBusinessTax({ state, need, round, businessNet }) {
  const targets = state.incomes.filter((i) => i.category === 'business' && i.businessType === 'general');
  if (targets.length === 0) return { total: 0, note: state.incomes.some((i) => i.category === 'business') ? '業種が不明・対象外のため0円として扱っています' : '事業所得なし' };
  const rate = need('businessTax.rate');
  const main = need('businessTax.mainDeduction');
  if (rate === undefined || main === undefined) return { total: null };
  const income = targets.reduce((a, i) => a + i.amount - i.expenses, 0); // 青色特別控除は適用しない前提（要確認）
  const taxable = Math.max(0, income - main);
  const total = round(Math.floor(taxable * rate), 'businessTax');
  return total === undefined ? { total: null } : { total, income, taxable, note: '当年所得に対して翌年に納付' };
}

function calcSocialInsurance({ state, need, salaryRevenue, totalIncome }) {
  const actual = state.insurance.actualAnnual;
  if (actual != null) return { total: actual, mode: 'actual' };
  if (state.insurance.type === 'dependent' || state.insurance.type === 'none') return { total: 0, mode: 'estimate' };
  const e = need(`socialInsurance.estimate.${state.insurance.type}`);
  if (!e) return { total: null, mode: 'estimate' };
  const baseVal = e.base === 'salaryRevenue' ? salaryRevenue : totalIncome;
  if (baseVal === null) return { total: null, mode: 'estimate' };
  return { total: Math.floor(baseVal * (e.rate ?? 0)) + (e.fixed ?? 0), mode: 'estimate' };
}
