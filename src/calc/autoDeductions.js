// 人的控除の自動計算（配偶者・扶養・特定親族特別控除・障害者・寡婦/ひとり親・勤労学生）。所得税と住民税で別々に呼ぶ。
// 金額・所得要件・年齢区分は rules.deductions.<incomeTax|residentTax>（年度別データ）から読む。値が無ければ amount: null。
// 障害者・寡婦・ひとり親などの該当はユーザーの申告に基づく（証明書類が必要な場合がある）。
import { lookupStep } from './progressive.js';

const LABEL = {
  spouse: '配偶者控除・配偶者特別控除',
  dependent: '扶養控除',
  specificRelative: '特定親族特別控除',
  disability: '障害者控除',
  widowSingleParent: '寡婦控除・ひとり親控除',
  workingStudent: '勤労学生控除',
};

// 入力上、該当しうる自動控除の id（金額データの有無に関係なく判定）
export function declaredAutoIds(state) {
  const ids = [];
  if (state.spouse.exists) ids.push('spouse');
  if (state.dependents.length) ids.push('dependent', 'specificRelative');
  if (state.self.disability !== 'none' || (state.spouse.exists && state.spouse.disability !== 'none') || state.dependents.some((d) => d.disability !== 'none')) ids.push('disability');
  if (state.self.widowSingleParent !== 'none') ids.push('widowSingleParent');
  if (state.self.workingStudent) ids.push('workingStudent');
  return ids;
}

export const autoLabel = (id) => LABEL[id];

// 戻り値: [{ id, label, amount|null, mode: 'auto' }]。totalIncome は本人の合計所得金額（null なら未確定）。
export function autoPersonalDeductions(state, d, totalIncome, need, key) {
  const out = [];
  const add = (id, amount) => out.push({ id, label: LABEL[id], amount, mode: 'auto' });
  const ids = declaredAutoIds(state);
  if (ids.length === 0) return out;
  if (!d) {
    need(`deductions.${key}`);
    return ids.filter((id) => id !== 'specificRelative').map((id) => ({ id, label: LABEL[id], amount: null, mode: 'auto' }));
  }

  // 配偶者控除・配偶者特別控除
  if (ids.includes('spouse')) {
    const sp = state.spouse;
    const c = d.spouse;
    if (totalIncome === null) add('spouse', null);
    else if (totalIncome > c.ownerIncomeLimit) add('spouse', 0);
    else {
      const col = c.ownerColumns.findIndex((x) => totalIncome <= x);
      if (sp.income <= c.spouseIncomeMax) add('spouse', (sp.age >= 70 ? c.elder : c.general)[col]);
      else {
        const step = c.specialSteps.find((s) => sp.income <= s.upTo);
        add('spouse', step ? step.amounts[col] : 0);
      }
    }
  }

  // 扶養控除（一般・特定・老人・同居老親等）
  if (ids.includes('dependent')) {
    const c = d.dependent;
    let sum = 0;
    for (const p of state.dependents) {
      if (p.income > c.incomeMax) continue;
      if (p.age >= c.specific.minAge && p.age <= c.specific.maxAge) sum += c.specific.amount;
      else if (p.age >= c.elder.minAge) sum += (p.cohabiting && (p.relationship === 'parent' || p.relationship === 'grandparent')) ? c.elder.cohabitingParent : c.elder.other;
      else if (p.age >= c.general.minAge) sum += c.general.amount;
    }
    add('dependent', sum);
  }

  // 特定親族特別控除（所得が基準超〜上限以下の親族）。年齢要件の資料が無ければ確定させない。
  if (ids.includes('specificRelative')) {
    const c = d.specificRelative;
    const cand = state.dependents.filter((p) => p.income > c.incomeMin && p.income <= c.incomeMax);
    if (cand.length) {
      if (c.ageMin == null || c.ageMax == null) {
        need(`deductions.${key}.specificRelative.ageMin`);
        add('specificRelative', null);
      } else {
        add('specificRelative', cand.filter((p) => p.age >= c.ageMin && p.age <= c.ageMax).reduce((a, p) => a + lookupStep(p.income, c.steps), 0));
      }
    }
  }

  // 障害者控除（本人・同一生計配偶者・扶養親族。区分と同居で金額が変わる）
  if (ids.includes('disability')) {
    const c = d.disability;
    const amt = (kind, cohabiting) => (kind === 'general' ? c.general : kind === 'special' ? (cohabiting ? c.specialCohabiting : c.special) : 0);
    let sum = amt(state.self.disability, false);
    if (state.spouse.exists && state.spouse.income <= d.spouse.spouseIncomeMax) sum += amt(state.spouse.disability, state.spouse.cohabiting);
    for (const p of state.dependents) if (p.income <= d.dependent.incomeMax) sum += amt(p.disability, p.cohabiting);
    add('disability', sum);
  }

  if (ids.includes('widowSingleParent')) {
    const over = d.widowSingleParentIncomeMax != null && totalIncome !== null && totalIncome > d.widowSingleParentIncomeMax;
    add('widowSingleParent', totalIncome === null && d.widowSingleParentIncomeMax != null ? null : over ? 0 : state.self.widowSingleParent === 'widow' ? d.widow : d.singleParent);
  }

  if (ids.includes('workingStudent')) {
    add('workingStudent', totalIncome === null ? null : totalIncome <= d.workingStudent.incomeMax ? d.workingStudent.amount : 0);
  }
  return out;
}

// 互換用（所得税）
export const autoIncomeTaxDeductions = (state, d, totalIncome, need) => autoPersonalDeductions(state, d, totalIncome, need, 'incomeTax');
