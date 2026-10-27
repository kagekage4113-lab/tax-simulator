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
import { earthquakeDeduction, lifeInsuranceDeduction } from './insuranceDeductions.js';
import { getIncomeCategory } from '../data/incomeCategories.js';
import { INCOME_DEDUCTIONS } from '../data/deductions.js';

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

const formatYenText = (n) => n.toLocaleString('ja-JP');
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

  // ---- 4. 申告分離課税（FX・先物／上場株式等）。損失は区分ごとに通算し、翌年以後3年間繰り越せる ----
  const fxProfit = sum('fx', (i) => i.amount);
  const fxPool = carryPool({ state, need, notes, profit: fxProfit, losses: state.fxCarryLosses, key: 'fx', label: 'FX・先物', procedure: '繰越控除を受けるには、損失の年から連続して「先物取引に係る繰越損失用」の付表付きで確定申告を行う必要があります（国税庁No.1523）。' });
  const listedProfit = sum('listedStock', (i) => i.amount);
  const listedPool = carryPool({ state, need, notes, profit: listedProfit, losses: state.listedCarryLosses, key: 'listed', label: '上場株式等', procedure: '繰越控除を受けるには、損失の年から連続して確定申告を行う必要があります（国税庁「株式・配当・利子と税」）。NISA口座の損失は、ないものとみなされ通算・繰越できません。' });
  const { carryIn, carryNext, carryExpired, expiringAmount } = fxPool;
  const fxCarryUsed = fxPool.carryUsed;
  const fxIncome = fxPool.income;
  const fxCarryRemaining = fxPool.remaining;
  const listedIncome = listedPool.income;

  const totalIncome = comprehensiveIncome === null ? null : comprehensiveIncome + fxIncome + listedIncome; // 合計所得金額（簡易）

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
    // 総合課税で引ききれない控除は、FX・先物 → 上場株式等 の順に分離課税の所得から引く
    const fx = Math.max(0, fxIncome - spill);
    const listed = Math.max(0, listedIncome - Math.max(0, spill - fxIncome));
    const sep = fxIncome + listedIncome;
    return { comprehensive: round(comp, roundKey), fx: round(fx, roundKey), listed: round(listed, roundKey), spillToFx: Math.min(spill, sep), unusedDeduction: Math.max(0, spill - sep) };
  };
  const taxableIT = taxableFor('incomeTax');
  const taxableRT = taxableFor('residentTax');

  // ---- 8-11. 所得税 ----
  let incomeTax = null;
  if (taxableIT) {
    const brackets = need('incomeTax.brackets');
    const recRate = need('incomeTax.reconstructionRate');
    const fxRate = fxIncome > 0 ? need('fx.incomeTaxRate') : 0;
    const listedRate = listedIncome > 0 ? need('listed.incomeTaxRate') : 0;
    if (brackets && fxRate !== undefined && listedRate !== undefined) {
      const comp = calcProgressive(taxableIT.comprehensive, brackets);
      if (comp === null) missing.add(`incomeTax.brackets@>${brackets[brackets.length - 1].upTo}`);
      else {
        const fx = mulFloor(taxableIT.fx, fxRate);
        const listed = mulFloor(taxableIT.listed, listedRate);
        const credit = state.taxCredits.housingLoan.amount; // 所得税の税額控除（手入力）
        const base = Math.max(0, comp + fx + listed - credit);
        // 復興特別所得税の率が未登録の間は、基準所得税額までを表示し合計は出さない。
        const recon = recRate === undefined ? null : round(mulFloor(base, recRate), 'reconstruction');
        incomeTax = { comprehensiveTax: comp, fxTax: fx, listedTax: listed, credit, base, reconstruction: recon, total: recon === null ? null : round(base + recon, 'incomeTax') };
      }
    }
  }

  // ---- 12. 住民税 ----
  let residentTax = null;
  let furusato = null;
  if (taxableRT) {
    const rate = need('residentTax.incomeRate');
    const perCapita = need('residentTax.perCapita');
    const fxRate = fxIncome > 0 ? need('fx.residentTaxRate') : 0;
    const listedRate = listedIncome > 0 ? need('listed.residentTaxRate') : 0;
    if (rate !== undefined && perCapita !== undefined && fxRate !== undefined && listedRate !== undefined) {
      const levy = round(mulFloor(taxableRT.comprehensive, rate), 'residentIncomeLevy');
      const fx = mulFloor(taxableRT.fx, fxRate);
      const listed = mulFloor(taxableRT.listed, listedRate);
      const credit = state.taxCredits.donationCredit.amount;
      const adj = rules.residentTax.adjustment;
      const adjustment = adj ? calcAdjustmentCredit(state, adj, deductions.residentTax, totalIncome, taxableRT.comprehensive) : 0;
      const exemption = calcResidentExemption(state, rules, totalIncome);
      const incomeLevy = exemption ? 0 : Math.max(0, levy - adjustment - credit);
      const fxTax = exemption ? 0 : fx;
      const listedTax = exemption ? 0 : listed;
      const perCapitaDue = exemption === 'all' ? 0 : perCapita;
      furusato = calcFurusatoLimit(rules, taxableIT, exemption ? 0 : Math.max(0, levy - adjustment));
      residentTax = { incomeLevy, fxTax, listedTax, perCapita: perCapitaDue, credit, adjustment: exemption ? 0 : adjustment, exemption, total: incomeLevy + fxTax + listedTax + perCapitaDue };
      if (exemption) notes.push(exemption === 'all' ? '住民税の非課税の基準に該当するため、住民税を0円としています。' : '住民税の所得割の非課税の基準に該当するため、所得割を0円としています（均等割は課税）。');
      notes.push(`住民税は${rules.residentTax.scope ? rules.residentTax.scope + 'の値による' : ''}概算です（${adj ? '' : '調整控除・'}非課税判定は未反映）。`);
    }
  }

  // ---- 13. 個人事業税 ----
  const businessTax = calcBusinessTax({ state, rules, need, round, notes });

  // ---- 手取り（7章の定義）----
  const taxesKnown = incomeTax && incomeTax.total !== null && residentTax && businessTax.total !== null && socialInsurance.total !== null;
  const takeHome = taxesKnown
    ? revenueTotal - expensesTotal + simpleComp + fxProfit + listedProfit
      - incomeTax.total - residentTax.total - businessTax.total - socialInsurance.total
    : null;
  const burden = taxesKnown ? incomeTax.total + residentTax.total + businessTax.total + socialInsurance.total : null;

  if (softMissing.size) notes.push(`端数処理の根拠が未登録のため、端数処理を行っていない項目があります（概算）：${[...softMissing].map((k) => ROUNDING_LABEL[k] || k).join('、')}`);

  const cryptoRevenue = sum('crypto', (i) => i.amount);
  const cth = get(rules, 'crypto.businessRevenueThreshold');
  if (cth != null && cryptoRevenue > cth) notes.push(`暗号資産の年間収入が${formatYenText(cth)}円を超えています。帳簿書類を保存している場合は原則として事業所得、保存がない場合は雑所得（業務に係る雑所得）に区分されます（国税庁FAQ 2-2）。事業所得として申告する場合は「事業収入」に入力してください。`);
  const filing = filingGuide(state, rules, { salaryRevenue, businessIncome, realEstateNet, miscIncome, simpleComp, fxProfit: fxProfit + listedProfit });

  // 途中で計算を打ち切っても、この入力で必要な未登録データを漏れなく列挙する。
  const required = [
    'incomeTax.brackets', 'incomeTax.reconstructionRate', 'residentTax.incomeRate', 'residentTax.perCapita',
    'basicDeduction.incomeTax', 'basicDeduction.residentTax',
  ];
  if (salaryRevenue > 0) required.push('salaryDeduction.brackets');
  if (fxIncome > 0) required.push('fx.incomeTaxRate', 'fx.residentTaxRate');
  if (listedIncome > 0) required.push('listed.incomeTaxRate', 'listed.residentTaxRate');
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
      fx: { profit: fxProfit, carryIn, carryUsed: fxCarryUsed, income: fxIncome, carryRemaining: fxCarryRemaining, carryNext, carryExpired, expiringAmount },
      listed: { profit: listedProfit, carryIn: listedPool.carryIn, carryUsed: listedPool.carryUsed, income: listedIncome, carryRemaining: listedPool.remaining, carryNext: listedPool.carryNext, carryExpired: listedPool.carryExpired, expiringAmount: listedPool.expiringAmount },
      total: totalIncome,
      revenueTotal, expensesTotal,
    },
    deductions,
    taxable: { incomeTax: taxableIT, residentTax: taxableRT },
    incomeTax, residentTax, businessTax, socialInsurance,
    filing, furusato,
    burden, takeHome,
  };
}

// 申告分離課税の繰越損失プール（FX・先物／上場株式等）。損失の年の翌年以後 carryForwardYears 年間、古い年の損失から順に、当年の利益を限度に控除する。
function carryPool({ state, need, notes, profit, losses, key, label, procedure }) {
  const years = losses.length ? need(`${key}.carryForwardYears`) : undefined;
  let profitLeft = Math.max(0, profit);
  let carryIn = 0;
  let carryUsed = 0;
  let expiringAmount = 0;
  const carryNext = []; // 翌年に繰り越せる損失
  const carryExpired = []; // 期限を過ぎて使えない損失
  for (const l of [...losses].sort((a, b) => a.year - b.year)) {
    if (years === undefined) break;
    if (l.year >= state.taxYear) { notes.push(`${l.year}年に生じた${label}の損失は${state.taxYear}年分には繰り越せないため無視しています。`); continue; }
    if (l.year < state.taxYear - years) { carryExpired.push(l); continue; }
    carryIn += l.amount;
    const use = Math.min(l.amount, profitLeft);
    profitLeft -= use;
    carryUsed += use;
    const rest = l.amount - use;
    if (rest > 0) {
      if (l.year >= state.taxYear + 1 - years) carryNext.push({ year: l.year, amount: rest });
      else expiringAmount += rest;
    }
  }
  const income = Math.max(0, profit) - carryUsed;
  if (profit < 0) carryNext.push({ year: state.taxYear, amount: -profit });
  if (profit < 0) notes.push(`${label}の損失は総合課税の所得と通算せず、翌年以後3年間の繰越損失として計上しています。`);
  if (carryExpired.length) notes.push(`${carryExpired.map((l) => `${l.year}年`).join('・')}に生じた${label}の損失は3年を過ぎているため、繰越控除に使えません。`);
  if (expiringAmount > 0) notes.push(`${label}の繰越損失のうち${expiringAmount.toLocaleString('ja-JP')}円は、今年で3年の期限を迎えるため翌年には繰り越せません。`);
  if (losses.length || profit < 0) notes.push(procedure);
  return { income, carryIn, carryUsed, carryNext, carryExpired, expiringAmount, remaining: carryNext.reduce((a, c) => a + c.amount, 0) };
}

// ふるさと納税の寄附上限額の目安（自己負担2,000円で収まる額）。住民税の特例分の上限（所得割額の20%）から逆算する一般的な算式。
//   上限 = 住民税所得割額（調整控除後）×20% ÷（90% − 所得税の限界税率×(1+復興税率)）+ 2,000円
// 住民税が非課税なら0。分離課税(FX等)・住宅ローン控除（住民税側）・医療費控除のセルフメディケーションは考慮しない目安。
function calcFurusatoLimit(rules, taxableIT, levyBase) {
  const fu = get(rules, 'furusato');
  const brackets = get(rules, 'incomeTax.brackets');
  if (!fu || !brackets || !taxableIT) return null;
  const b = taxableIT.comprehensive > 0 ? brackets.find((x) => x.upTo == null || taxableIT.comprehensive <= x.upTo) : null;
  const marginalRate = b ? b.rate : 0;
  const denom = 1 - fu.basicRate - marginalRate * (1 + (get(rules, 'incomeTax.reconstructionRate') ?? 0));
  if (levyBase <= 0 || denom <= 0) return { limit: 0, levyBase, marginalRate };
  return { limit: Math.floor((levyBase * fu.specialLimitRate) / denom + 1e-6) + fu.selfBurden, levyBase, marginalRate };
}

// 所得税の確定申告が必要か（給与所得者）の参考表示。国税庁 No.1900。断定せず「可能性」として示す。
// 給与1か所のみ: 給与・退職以外の各種の所得金額の合計が20万円超なら申告が必要。給与2か所以上は年末調整されなかった給与との合計で判定するため断定しない。
export function filingGuide(state, rules, v) {
  const cfg = get(rules, 'filing.salaryEarner');
  const salaries = state.incomes.filter((i) => i.category === 'salary');
  if (!cfg || salaries.length === 0) return null;
  const sideIncome = v.businessIncome + v.realEstateNet + v.miscIncome + v.simpleComp + Math.max(0, v.fxProfit);
  const base = { sideIncome, threshold: cfg.sideIncomeMax, salaryCount: salaries.length };
  if (v.salaryRevenue > cfg.salaryRevenueMax) return { ...base, status: 'required', reason: `給与の年間収入金額が${cfg.salaryRevenueMax.toLocaleString('ja-JP')}円を超えるため、確定申告が必要です。` };
  if (salaries.length >= 2) return { ...base, status: 'unknown', reason: `給与が2か所以上あります。年末調整されなかった給与の収入金額と給与以外の所得（現在 ${sideIncome.toLocaleString('ja-JP')}円）の合計が${cfg.sideIncomeMax.toLocaleString('ja-JP')}円を超える場合は、確定申告が必要です。` };
  if (sideIncome > cfg.sideIncomeMax) return { ...base, status: 'required', reason: `給与以外の所得の合計が${sideIncome.toLocaleString('ja-JP')}円で、${cfg.sideIncomeMax.toLocaleString('ja-JP')}円を超えるため、所得税の確定申告が必要になる可能性があります。` };
  return { ...base, status: 'likelyNotRequired', reason: `給与以外の所得の合計が${sideIncome.toLocaleString('ja-JP')}円で${cfg.sideIncomeMax.toLocaleString('ja-JP')}円以下のため、所得税の確定申告が不要となる可能性があります。` };
}

// 住民税の非課税の基準額（福山市）。扶養人数＝同一生計配偶者＋扶養親族（16歳未満を含む）。
export function residentNonTaxableLimits(state, rules) {
  const nt = get(rules, 'residentTax.nonTaxable');
  if (!nt) return null;
  const sp = get(rules, 'deductions.residentTax.spouse');
  const dp = get(rules, 'deductions.residentTax.dependent');
  const dependents = (state.spouse.exists && sp && state.spouse.income <= sp.spouseIncomeMax ? 1 : 0)
    + state.dependents.filter((d) => dp && d.income <= dp.incomeMax).length;
  const n = 1 + dependents;
  const g = nt.specialGroup;
  const special = g && (state.self.disability !== 'none' || state.self.age < g.minorUnderAge || state.self.widowSingleParent !== 'none') ? g.incomeMax : null;
  return {
    all: nt.perPerson * n + nt.base + (dependents ? nt.addIfDependents.allIncome : 0),
    levy: nt.perPerson * n + nt.base + (dependents ? nt.addIfDependents.incomeLevy : 0),
    special,
  };
}

// 住民税の非課税判定。'all' = 均等割・所得割とも非課税、'levy' = 所得割のみ非課税、null = 課税。
function calcResidentExemption(state, rules, totalIncome) {
  const lim = residentNonTaxableLimits(state, rules);
  if (!lim || totalIncome === null) return null;
  if (lim.special !== null && totalIncome <= lim.special) return 'all';
  if (totalIncome <= lim.all) return 'all';
  if (totalIncome <= lim.levy) return 'levy';
  return null;
}

// 住民税の調整控除（福山市の算式）。人的控除額の差（所得税−住民税）の合計①と合計課税所得金額②から求め、所得割から控除する。
//   ②≦200万円: min(①,②)×5% / 200万円<②≦2,500万円: max(①−(②−200万円), 5万円)×5% / 2,500万円超: なし
export function calcAdjustmentCredit(state, adj, residentDeductions, totalIncome, taxableComprehensive) {
  if (taxableComprehensive > adj.upperLimit) return 0;
  const basic = residentDeductions.items.find((i) => i.id === 'basic');
  const diffs = autoPersonalDeductions(state, adj.diffDeductions, totalIncome, () => {}, 'residentTax');
  const diffSum = (basic && basic.amount > 0 ? adj.basicDiff : 0) + diffs.reduce((a, i) => a + (i.amount ?? 0), 0);
  const base = taxableComprehensive <= adj.threshold
    ? Math.min(diffSum, taxableComprehensive)
    : Math.max(diffSum - (taxableComprehensive - adj.threshold), adj.minAfter);
  return mulFloor(base, adj.rate);
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
      } else if (id === 'casualty') {
        // 雑損控除: (1)（損害金額＋災害等関連支出−保険金等）−総所得金額等×10% と (2)（災害関連支出−保険金等）−5万円 のいずれか多い額
        const cfg = rules.casualty;
        if (!(box.loss + box.related > 0)) amount = 0;
        else if (!cfg) { need('casualty'); amount = null; }
        else if (totalIncome === null) amount = null;
        else {
          const disaster = Math.min(box.disasterRelated, box.related);
          const insuranceOnRelated = Math.max(0, box.insurance - box.loss); // 保険金等はまず損害金額から差し引き、超える分を関連支出から差し引く
          const a1 = box.loss + box.related - box.insurance - mulFloor(totalIncome, cfg.incomeRate);
          const a2 = disaster - insuranceOnRelated - cfg.relatedFloor;
          amount = Math.max(0, a1, a2);
        }
      } else if (id === 'lifeInsurance' || id === 'earthquakeInsurance') {
        // 控除額の直接入力があればそれを優先（手入力値）。なければ支払保険料から自動計算
        const premiums = Object.entries(box).filter(([k]) => k !== 'amount');
        if (box.amount > 0) amount = box.amount;
        else if (!premiums.some(([, v]) => v > 0)) amount = 0;
        else {
          const cfg = get(rules, `deductions.${kind}.insurance.${id === 'lifeInsurance' ? 'life' : 'earthquake'}`);
          if (!cfg) { need(`deductions.${kind}.insurance`); amount = null; }
          else if (id === 'lifeInsurance') {
            const dp = get(rules, 'deductions.incomeTax.dependent');
            const under23 = kind === 'incomeTax' && !!dp && state.dependents.some((d) => d.age < 23 && d.income <= dp.incomeMax);
            amount = lifeInsuranceDeduction(box, cfg, { under23 });
          } else amount = earthquakeDeduction(box, cfg);
          push(kind, { id, label: def.label, amount, mode: 'auto' });
          continue;
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
  if (e.model === 'fukuyamaKokuho') return { total: totalIncome === null ? null : fukuyamaKokuhoAnnual(e, state, totalIncome, need, notes), mode: 'estimate', kokuho: totalIncome === null ? null : kokuhoReduction(state, e, totalIncome) };
  const baseVal = e.base === 'salaryRevenue' ? salaryRevenue : totalIncome;
  if (baseVal === null) return { total: null, mode: 'estimate' };
  return { total: mulFloor(baseVal, e.rate ?? 0) + (e.fixed ?? 0), mode: 'estimate' };
}

// 被保険者負担分の端数: 50銭以下切り捨て・50銭超切り上げ（保険料額表の注①）
const roundHalfDown = (x) => {
  const f = Math.floor(x + 1e-9);
  return x - f > 0.5 + 1e-9 ? f + 1 : f;
};

// 国民健康保険税（福山市）＋国民年金の概算（個人事業主）。世帯＝本人・配偶者・扶養親族の全員が同じ国保に加入している前提。
// 所得は各人の合計所得金額で代用し、加入月数は12か月、法定軽減（7・5・2割）は未反映。国民年金の保険料額が未登録の間は null。
function fukuyamaKokuhoAnnual(e, state, totalIncome, need, notes) {
  if (e.pension == null) { need('socialInsurance.estimate.national.pension'); return null; }
  const members = [{ age: state.self.age, income: totalIncome }];
  if (state.spouse.exists) members.push({ age: state.spouse.age, income: state.spouse.income });
  for (const d of state.dependents) members.push({ age: d.age, income: d.income });
  const insured = members.filter((m) => m.age < e.retireAge);
  let tax = 0;
  const kokuho = kokuhoReduction(state, e, totalIncome);
  if (insured.length > 0) {
    for (const c of Object.values(e.components)) {
      const eligible = insured.filter((m) => c.ageMin == null || (m.age >= c.ageMin && m.age <= c.ageMax));
      if (eligible.length === 0) continue;
      const keep = 1 - (kokuho.rate ?? 0); // 法定軽減（均等割・平等割）
      let amount = eligible.reduce((a, m) => a + Math.max(0, m.income - lookupStep(m.income, e.basicDeduction)), 0) * c.incomeRate + c.perHousehold * keep;
      for (const m of eligible) {
        let per = c.perPerson;
        if (c.exemptUnderAge != null && m.age < c.exemptUnderAge) per = 0; // 子ども分：18歳未満は全額軽減
        else if (c.perPersonAdult != null && m.age >= 18) per += c.perPersonAdult;
        per *= keep;
        if (m.age < e.preschool.underAge) per *= 1 - e.preschool.reduction; // 未就学児の均等割5割軽減（法定軽減後の額から）
        amount += per;
      }
      tax += Math.min(c.limit, applyRounding(amount + 1e-6, e.rounding));
    }
  }
  (e.advisories || []).forEach((a) => notes.push(a));
  const pensionMembers = [state.self, ...(state.spouse.exists ? [state.spouse] : [])].filter((m) => m.age >= e.pension.ageMin && m.age <= e.pension.ageMax);
  notes.push(`個人事業主の社会保険料は、${e.scope}の国民健康保険税（本人・配偶者・扶養親族が同じ国保に加入し12か月加入の前提）と国民年金の概算です。${e.reduction ? (kokuho.rate ? `世帯の判定用所得が基準以下のため、均等割・平等割の${Math.round(kokuho.rate * 10)}割軽減を反映しています（給与・年金所得者は本人の給与収入のみで数えています）。` : '法定軽減（7・5・2割）は、世帯の判定用所得が基準を超えるため適用していません。') : '法定軽減（7・5・2割）は反映していません。'}`);
  if (members.length !== insured.length) notes.push('75歳以上の方は後期高齢者医療制度のため、国民健康保険税の対象から除いています。');
  return tax + pensionMembers.length * e.pension.monthly * 12;
}

// 国保税の法定軽減の基準額（二次情報）。世帯の判定用所得＝被保険者全員の基礎控除前の合計所得金額。
export function kokuhoReductionLimits(state, e) {
  const r = e && e.reduction;
  if (!r) return null;
  const members = [{ age: state.self.age }, ...(state.spouse.exists ? [{ age: state.spouse.age }] : []), ...state.dependents.map((d) => ({ age: d.age }))].filter((m) => m.age < e.retireAge);
  const earners = state.incomes.filter((i) => i.category === 'salary').reduce((a, i) => a + i.amount, 0) > r.salaryRevenueMin ? 1 : 0;
  const base = r.base + r.perSalaryOrPensionEarner * Math.max(0, earners - 1);
  return { insured: members.length, tiers: r.tiers.map((t) => ({ rate: t.rate, limit: base + t.perInsured * members.length })) };
}

function kokuhoReduction(state, e, totalIncome) {
  const lim = kokuhoReductionLimits(state, e);
  if (!lim) return { rate: null, householdIncome: null };
  const householdIncome = totalIncome + (state.spouse.exists && state.spouse.age < e.retireAge ? state.spouse.income : 0)
    + state.dependents.filter((d) => d.age < e.retireAge).reduce((a, d) => a + d.income, 0);
  const hit = lim.tiers.find((t) => householdIncome <= t.limit);
  return { rate: hit ? hit.rate : null, householdIncome, limits: lim.tiers };
}

// 協会けんぽ（会社員）の概算: 給与収入を12か月均等の報酬月額とみなし、標準報酬月額の等級から
// 健康保険（＋介護）・子ども・子育て支援金・厚生年金の被保険者負担（折半）を月ごとの料率スケジュールで求める。賞与・雇用保険は含まない。
function kyokaiKenpoAnnual(e, state, salaryRevenue, notes) {
  if (!(salaryRevenue > 0)) return 0;
  const monthly = Math.floor(salaryRevenue / 12);
  const grade = e.grades.find((g) => (g.min == null || monthly >= g.min) && (g.max == null || monthly < g.max));
  const std = grade.standard;
  const pensionStd = Math.min(e.pension.range.max, Math.max(e.pension.range.min, std));
  const kaigoOn = state.self.age >= e.careAge.min && state.self.age <= e.careAge.max;
  const pref = state.residence.prefecture;
  let total = 0;
  let usedAverage = false;
  for (const p of e.schedule) {
    const rates = Object.values(p.healthRateByPrefecture);
    const prefRate = p.healthRateByPrefecture[pref];
    if (prefRate === undefined) usedAverage = true;
    const healthRate = prefRate ?? rates.reduce((a, b) => a + b, 0) / rates.length;
    const share = (std * (healthRate + (kaigoOn ? p.careRate : 0) + p.childSupportRate) + pensionStd * e.pension.rate) * e.employeeShare;
    total += roundHalfDown(share) * p.months;
  }
  notes.push('社会保険料は協会けんぽの料率による概算です（賞与なし・12か月均等の報酬として計算。健保組合・共済や賞与の有無で異なります。雇用保険料は含みません）。');
  if (usedAverage) notes.push(`お住まいの都道府県（${pref || '未選択'}）の協会けんぽ料率が未登録の期間があるため、登録済み支部（${Object.keys(e.schedule[e.schedule.length - 1].healthRateByPrefecture).join('・')}）の健康保険料率の平均を使っています。`);
  if (kaigoOn) notes.push('40〜64歳のため介護保険料を含めています。');
  return total;
}
