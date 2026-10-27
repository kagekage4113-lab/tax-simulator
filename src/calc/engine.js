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
//   deductions: { incomeTax: { spouse, dependent, specificRelative, disability, widow, singleParent, workingStudent } }  → autoDeductions.js
// 表の最後の upTo が null でない場合は「その金額までしか資料がない」。超える入力は「未登録」として扱う。
// rounding.* が未登録の場合は端数処理なしで計算し、notes に記載する（概算）。
import { mulFloor } from '../core/money.js';
import { applyRounding } from './rounding.js';
import { calcProgressive, lookupStep } from './progressive.js';
import { autoPersonalDeductions, declaredAutoIds } from './autoDeductions.js';
import { getIncomeCategory } from '../data/incomeCategories.js';
import { INCOME_DEDUCTIONS } from '../data/deductions.js';

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

const ROUNDING_LABEL = {
  taxableIncome: '所得税の課税所得', residentTaxableIncome: '住民税の課税所得', incomeTax: '所得税額',
  reconstruction: '復興特別所得税額', residentIncomeLevy: '住民税の所得割額', businessTax: '個人事業税額',
};

export function calculate(state, rules) {
  const missing = new Set();
  const notes = [...(rules.advisories || [])];
  const need = (path) => {
    const v = get(rules, path);
    if (v == null) { missing.add(path); return undefined; }
    return v;
  };
  const softMissing = new Set();
  const round = (value, key) => {
    const r = get(rules, `rounding.${key}`);
    if (!r) { softMissing.add(key); return Math.floor(value); }
    return applyRounding(value, r);
  };

  // ---- 1-3. 所得区分ごとの所得と損益通算 ----
  const sum = (cat, f) => state.incomes.filter((i) => (Array.isArray(cat) ? cat.includes(i.category) : i.category === cat)).reduce((a, i) => a + f(i), 0);
  const salaryRevenue = sum('salary', (i) => i.amount);
  const businessNet = sum('business', (i) => i.amount - i.expenses);
  const businessRevenue = sum('business', (i) => i.amount);
  const realEstateNet = sum('realEstate', (i) => i.amount - i.expenses);
  const miscNet = sum(['misc', 'crypto'], (i) => i.amount - i.expenses); // 暗号資産も雑所得
  const expensesTotal = state.incomes.reduce((a, i) => a + (getIncomeCategory(i.category).hasExpenses ? i.expenses : 0), 0);
  const revenueTotal = state.incomes
    .filter((i) => ['salary', 'business', 'realEstate', 'misc', 'crypto'].includes(i.category))
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
    const b = sd && sd.find((x) => x.upTo == null || salaryRevenue <= x.upTo);
    const override = (get(rules, 'salaryDeduction.incomeOverrides') || []).find((o) => salaryRevenue >= o.from && salaryRevenue < o.to);
    const approx = get(rules, 'salaryDeduction.approximate');
    if (approx && salaryRevenue >= approx.from && salaryRevenue < approx.below) notes.push('給与収入660万円未満は、法令上は別表（年末調整等のための給与所得控除後の給与等の金額の表）で給与所得を求めるため、速算式による金額と数千円程度の差が出る場合があります。');
    if (override) {
      salaryIncome = override.income;
      salaryDeductionAmount = salaryRevenue - override.income;
    } else if (sd && !b) {
      missing.add(`salaryDeduction.brackets@>${sd[sd.length - 1].upTo}`);
      salaryIncome = null;
    } else if (sd) {
      salaryDeductionAmount = mulFloor(salaryRevenue, b.rate) + b.add;
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
  const socialInsurance = calcSocialInsurance({ state, need, salaryRevenue, totalIncome, notes });
  const deductions = calcDeductions({ state, rules, need, totalIncome, socialInsurance });
  if (declaredAutoIds(state).length) notes.push('配偶者・扶養・障害者・寡婦/ひとり親・勤労学生などの適用は、ご自身の申告に基づく前提です（適用には証明書類が必要な場合があります）。年齢は12月31日時点で入力してください。');

  // ---- 6-7. 課税所得 ----
  const taxableFor = (kind) => {
    const ded = deductions[kind];
    const roundKey = kind === 'incomeTax' ? 'taxableIncome' : 'residentTaxableIncome';
    if (ded.total === null || comprehensiveIncome === null) return null;
    const comp = Math.max(0, comprehensiveIncome - ded.total);
    const spill = Math.max(0, ded.total - comprehensiveIncome); // 総合で引ききれない控除
    const fx = Math.max(0, fxIncome - spill);
    return { comprehensive: round(comp, roundKey), fx: round(fx, roundKey), spillToFx: Math.min(spill, fxIncome), unusedDeduction: Math.max(0, spill - fxIncome) };
  };
  const taxableIT = taxableFor('incomeTax');
  const taxableRT = taxableFor('residentTax');

  // ---- 8-11. 所得税 ----
  let incomeTax = null;
  if (taxableIT) {
    const brackets = need('incomeTax.brackets');
    const recRate = need('incomeTax.reconstructionRate');
    const fxRate = fxIncome > 0 ? need('fx.incomeTaxRate') : 0;
    if (brackets && fxRate !== undefined) {
      const comp = calcProgressive(taxableIT.comprehensive, brackets);
      if (comp === null) missing.add(`incomeTax.brackets@>${brackets[brackets.length - 1].upTo}`);
      else {
        const fx = mulFloor(taxableIT.fx, fxRate);
        const credit = state.taxCredits.housingLoan.amount; // 所得税の税額控除（手入力）
        const base = Math.max(0, comp + fx - credit);
        // 復興特別所得税の率が未登録の間は、基準所得税額までを表示し合計は出さない。
        const recon = recRate === undefined ? null : round(mulFloor(base, recRate), 'reconstruction');
        incomeTax = { comprehensiveTax: comp, fxTax: fx, credit, base, reconstruction: recon, total: recon === null ? null : round(base + recon, 'incomeTax') };
      }
    }
  }

  // ---- 12. 住民税 ----
  let residentTax = null;
  if (taxableRT) {
    const rate = need('residentTax.incomeRate');
    const perCapita = need('residentTax.perCapita');
    const fxRate = fxIncome > 0 ? need('fx.residentTaxRate') : 0;
    if (rate !== undefined && perCapita !== undefined && fxRate !== undefined) {
      const levy = round(mulFloor(taxableRT.comprehensive, rate), 'residentIncomeLevy');
      const fx = mulFloor(taxableRT.fx, fxRate);
      const credit = state.taxCredits.donationCredit.amount;
      const incomeLevy = Math.max(0, levy - credit);
      residentTax = { incomeLevy, fxTax: fx, perCapita, credit, total: incomeLevy + fx + perCapita };
      notes.push(`住民税は${rules.residentTax.scope ? rules.residentTax.scope + 'の値による' : ''}概算です（調整控除・非課税判定は未反映）。`);
    }
  }

  // ---- 13. 個人事業税 ----
  const businessTax = calcBusinessTax({ state, rules, need, round, notes });

  // ---- 手取り（7章の定義）----
  const taxesKnown = incomeTax && incomeTax.total !== null && residentTax && businessTax.total !== null && socialInsurance.total !== null;
  const takeHome = taxesKnown
    ? revenueTotal - expensesTotal + simpleComp + fxProfit
      - incomeTax.total - residentTax.total - businessTax.total - socialInsurance.total
    : null;
  const burden = taxesKnown ? incomeTax.total + residentTax.total + businessTax.total + socialInsurance.total : null;

  if (softMissing.size) notes.push(`端数処理の根拠が未登録のため、端数処理を行っていない項目があります（概算）：${[...softMissing].map((k) => ROUNDING_LABEL[k] || k).join('、')}`);

  // 途中で計算を打ち切っても、この入力で必要な未登録データを漏れなく列挙する。
  const required = [
    'incomeTax.brackets', 'incomeTax.reconstructionRate', 'residentTax.incomeRate', 'residentTax.perCapita',
    'basicDeduction.incomeTax', 'basicDeduction.residentTax',
  ];
  if (salaryRevenue > 0) required.push('salaryDeduction.brackets');
  if (fxIncome > 0) required.push('fx.incomeTaxRate', 'fx.residentTaxRate');
  if (state.incomes.some((i) => i.category === 'business' && i.businessType !== 'unknown')) required.push('businessTax.rates', 'businessTax.mainDeduction');
  if (state.insurance.actualAnnual == null && ['employee', 'national'].includes(state.insurance.type)) required.push(`socialInsurance.estimate.${state.insurance.type}`);
  if (declaredAutoIds(state).length) required.push('deductions.incomeTax', 'deductions.residentTax');
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
  const push = (kind, item) => {
    out[kind].items.push(item);
    if (out[kind].total !== null) out[kind].total = item.amount === null ? null : out[kind].total + item.amount;
  };

  for (const kind of ['incomeTax', 'residentTax']) {
    // 基礎控除（自動）
    const steps = need(`basicDeduction.${kind}`);
    const basic = steps && totalIncome !== null ? lookupStep(totalIncome, steps) : null;
    if (steps && totalIncome !== null && basic === null) need(`basicDeduction.${kind}@>${steps[steps.length - 1].upTo}`);
    push(kind, { id: 'basic', label: '基礎控除', amount: basic, mode: 'auto' });
    // 社会保険料控除（自動: 実額 or 概算）
    push(kind, { id: 'socialInsurance', label: '社会保険料控除', amount: siFull.total, mode: siFull.mode === 'actual' ? 'actual' : 'estimate' });
    // 人的控除などの自動計算（金額データが無い年度は未確定 null）
    autoPersonalDeductions(state, get(rules, `deductions.${kind}`), totalIncome, need, kind).forEach((a) => push(kind, a));
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
          const threshold = Math.min(m.thresholdFixed, mulFloor(totalIncome, m.thresholdRate));
          amount = Math.min(m.cap, Math.max(0, box.paid - box.reimbursed - threshold));
        }
      } else amount = box.amount;
      if (amount !== 0 || id !== 'medical') push(kind, { id, label: def.label, amount, mode: 'manual' });
    }
  }
  return out;
}

// 個人事業税（業種ごとの税率）。青色申告特別控除は適用しない（広島県の資料）。
// 複数の業種がある場合は、事業主控除を所得の割合で按分する（簡易）。
function calcBusinessTax({ state, rules, need, round, notes }) {
  const targets = state.incomes.filter((i) => i.category === 'business' && i.businessType !== 'unknown');
  if (targets.length === 0) return { total: 0, note: state.incomes.some((i) => i.category === 'business') ? '業種が不明・対象外のため0円として扱っています' : '事業所得なし' };
  const rates = need('businessTax.rates');
  const main = need('businessTax.mainDeduction');
  if (rates === undefined || main === undefined) return { total: null };
  const byType = {};
  for (const i of targets) byType[i.businessType] = (byType[i.businessType] || 0) + i.amount - i.expenses;
  const income = Object.values(byType).reduce((a, b) => a + b, 0);
  const taxable = Math.max(0, income - main);
  const positive = Object.values(byType).reduce((a, v) => a + Math.max(0, v), 0);
  let sum = 0;
  for (const [type, v] of Object.entries(byType)) {
    if (rates[type] == null) return { total: null };
    if (positive > 0 && v > 0) sum += taxable * (v / positive) * rates[type];
  }
  if (Object.keys(byType).length > 1) notes.push('複数の業種がある個人事業税は、事業主控除を所得の割合で按分した簡易計算です。');
  notes.push('個人事業税は事業主控除の月割（年の途中の開業・廃業）、損失の繰越控除、専従者給与を反映していません。');
  return { total: round(Math.floor(sum + 1e-6), 'businessTax'), income, taxable, note: '当年所得に対して翌年に納付' };
}

function calcSocialInsurance({ state, need, salaryRevenue, totalIncome, notes }) {
  const actual = state.insurance.actualAnnual;
  if (actual != null) return { total: actual, mode: 'actual' };
  if (state.insurance.type === 'dependent' || state.insurance.type === 'none') return { total: 0, mode: 'estimate' };
  const e = need(`socialInsurance.estimate.${state.insurance.type}`);
  if (!e) return { total: null, mode: 'estimate' };
  if (e.model === 'kyokaiKenpo') return { total: kyokaiKenpoAnnual(e, state, salaryRevenue, notes), mode: 'estimate' };
  const baseVal = e.base === 'salaryRevenue' ? salaryRevenue : totalIncome;
  if (baseVal === null) return { total: null, mode: 'estimate' };
  return { total: mulFloor(baseVal, e.rate ?? 0) + (e.fixed ?? 0), mode: 'estimate' };
}

// 被保険者負担分の端数: 50銭以下切り捨て・50銭超切り上げ（保険料額表の注①）
const roundHalfDown = (x) => {
  const f = Math.floor(x + 1e-9);
  return x - f > 0.5 + 1e-9 ? f + 1 : f;
};

// 協会けんぽ（会社員）の概算: 給与収入を12か月均等の報酬月額とみなし、標準報酬月額の等級から
// 健康保険（＋介護）・子ども・子育て支援金・厚生年金の被保険者負担（折半）を求める。賞与・雇用保険は含まない。
function kyokaiKenpoAnnual(e, state, salaryRevenue, notes) {
  if (!(salaryRevenue > 0)) return 0;
  const monthly = Math.floor(salaryRevenue / 12);
  const grade = e.grades.find((g) => (g.min == null || monthly >= g.min) && (g.max == null || monthly < g.max));
  const std = grade.standard;
  const prefRate = e.healthRateByPrefecture[state.residence.prefecture];
  const rates = Object.values(e.healthRateByPrefecture);
  const healthRate = prefRate ?? rates.reduce((a, b) => a + b, 0) / rates.length;
  const kaigo = state.self.age >= e.care.ageMin && state.self.age <= e.care.ageMax ? e.care.rate : 0;
  const pensionStd = Math.min(e.pension.range.max, Math.max(e.pension.range.min, std));
  const monthlyShare = (std * (healthRate + kaigo + e.childSupportRate) + pensionStd * e.pension.rate) * e.employeeShare;
  notes.push('社会保険料は協会けんぽの料率による概算です（賞与なし・12か月均等の報酬として計算。健保組合・共済や賞与の有無で異なります。雇用保険料は含みません）。');
  if (prefRate === undefined) notes.push(`お住まいの都道府県の協会けんぽ料率が未登録のため、登録済み${rates.length}府県（広島・福岡・大阪）の健康保険料率の平均を使っています。`);
  if (kaigo) notes.push('40〜64歳のため介護保険料を含めています。');
  return roundHalfDown(monthlyShare) * 12;
}
