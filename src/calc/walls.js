// 「壁」（条件が変わる境界）の定義。しきい値は年度別税制データ（rules）と入力から求め、手書きの値は持たない。
// metric: 追加収入のシミュレーション中に参照する指標。threshold を「超える」と条件が変わる。
//   totalIncome=本人の合計所得金額 / taxableIT=所得税の課税所得(総合) / taxableRT=住民税の課税所得(総合) / businessNet=個人事業税の対象事業の所得
import { kokuhoReductionLimits, residentNonTaxableLimits } from './engine.js';

const man = (n) => `${Math.round(n / 10_000).toLocaleString('ja-JP')}万円`;
const pct = (r) => `${Math.round(r * 1000) / 10}%`;
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

export function wallDefinitions(state, rules) {
  const walls = [];
  const add = (w) => walls.push(w);

  const brackets = get(rules, 'incomeTax.brackets');
  if (brackets) {
    brackets.forEach((b, i) => {
      if (b.upTo == null) return;
      add({ id: `incomeTaxBracket${i}`, metric: 'taxableIT', threshold: b.upTo, label: `所得税の税率が${pct(b.rate)}→${pct(brackets[i + 1].rate)}に上がる`, detail: `所得税の課税所得が${b.upTo.toLocaleString('ja-JP')}円を超える部分から`, source: '国税庁 No.2260' });
    });
  }
  for (const [kind, name] of [['incomeTax', '所得税'], ['residentTax', '住民税']]) {
    const steps = get(rules, `basicDeduction.${kind}`);
    if (!steps) continue;
    steps.forEach((st, i) => {
      if (st.upTo == null) return;
      const next = steps[i + 1];
      if (next.amount < st.amount) add({ id: `basicDeduction${kind}${i}`, metric: 'totalIncome', threshold: st.upTo, label: `基礎控除（${name}）が${man(st.amount)}→${man(next.amount)}に減る`, detail: `合計所得金額が${st.upTo.toLocaleString('ja-JP')}円を超えると`, source: kind === 'incomeTax' ? '国税庁 年末調整のしかた' : '福山市 所得控除の種類' });
    });
  }
  const sp = get(rules, 'deductions.incomeTax.spouse');
  if (state.spouse.exists && sp) {
    sp.ownerColumns.forEach((c, i) => add({ id: `spouseOwner${i}`, metric: 'totalIncome', threshold: c, label: i < sp.ownerColumns.length - 1 ? '配偶者控除・配偶者特別控除の額が下がる' : '配偶者控除・配偶者特別控除がなくなる', detail: `本人の合計所得金額が${c.toLocaleString('ja-JP')}円を超えると（所得税。住民税も同じ区切り）`, source: '国税庁 年末調整のしかた' }));
  }
  const adj = get(rules, 'residentTax.adjustment');
  if (adj) {
    add({ id: 'adjustmentThreshold', metric: 'taxableRT', threshold: adj.threshold, label: '住民税の調整控除の計算が変わる（減っていく）', detail: `住民税の課税所得が${adj.threshold.toLocaleString('ja-JP')}円を超えると、人的控除の差額から差し引いて減り、最低5万円になる`, source: '福山市 調整控除' });
    add({ id: 'adjustmentLimit', metric: 'taxableRT', threshold: adj.upperLimit, label: '住民税の調整控除がなくなる', detail: `住民税の課税所得が${adj.upperLimit.toLocaleString('ja-JP')}円を超えると`, source: '福山市 調整控除' });
  }
  const lim = residentNonTaxableLimits(state, rules);
  if (lim) {
    const lines = [];
    // 障がい者・未成年者・ひとり親・寡婦の基準（special）と、人数による基準（all）のうち、どちらか大きい方まで均等割・所得割とも非課税
    const allLimit = Math.max(lim.special ?? 0, lim.all);
    lines.push({ t: allLimit, label: lim.special !== null && lim.special >= lim.all ? '住民税が非課税でなくなる（障がい者・未成年者・ひとり親・寡婦の基準）' : '住民税（均等割・所得割）が非課税でなくなる' });
    if (lim.levy > allLimit) lines.push({ t: lim.levy, label: '住民税の所得割が非課税でなくなる（均等割は先にかかる）' });
    for (const l of lines) add({ id: `nonTaxable${l.t}`, metric: 'totalIncome', threshold: l.t, label: l.label, detail: `合計所得金額が${l.t.toLocaleString('ja-JP')}円を超えると`, source: '福山市 個人市民税' });
  }
  const bt = get(rules, 'businessTax');
  if (bt && state.incomes.some((i) => i.category === 'business' && i.businessType !== 'unknown')) {
    add({ id: 'businessTax', metric: 'businessNet', threshold: bt.mainDeduction, label: '個人事業税がかかり始める', detail: `事業所得が事業主控除${bt.mainDeduction.toLocaleString('ja-JP')}円を超えると`, source: '広島県 個人事業税' });
  }
  const ws = get(rules, 'deductions.incomeTax.workingStudent');
  if (state.self.workingStudent && ws) add({ id: 'workingStudent', metric: 'totalIncome', threshold: ws.incomeMax, label: '勤労学生控除がなくなる', detail: `合計所得金額が${ws.incomeMax.toLocaleString('ja-JP')}円を超えると`, source: '国税庁 年末調整のしかた' });
  const wsp = get(rules, 'deductions.incomeTax.widowSingleParentIncomeMax');
  if (state.self.widowSingleParent !== 'none' && wsp) add({ id: 'widowSingleParent', metric: 'totalIncome', threshold: wsp, label: '寡婦控除・ひとり親控除がなくなる', detail: `合計所得金額が${wsp.toLocaleString('ja-JP')}円を超えると`, source: '福山市 所得控除の種類' });

  const nat = get(rules, 'socialInsurance.estimate.national');
  if (state.insurance.type === 'national' && state.insurance.actualAnnual == null && nat && nat.reduction) {
    const lim = kokuhoReductionLimits(state, nat);
    lim.tiers.forEach((t, i) => {
      const next = lim.tiers[i + 1];
      add({ id: `kokuhoReduction${i}`, metric: 'householdIncome', threshold: t.limit, label: `国保税の法定軽減が${Math.round(t.rate * 10)}割から${next ? `${Math.round(next.rate * 10)}割` : 'なし'}に下がる`, detail: `世帯の判定用所得（基礎控除前の合計所得）が${t.limit.toLocaleString('ja-JP')}円を超えると（被保険者${lim.insured}人）`, source: '二次情報（福山市の公式資料は未確認）' });
    });
  }
  const fl = get(rules, 'filing.salaryEarner');
  if (fl && state.incomes.filter((i) => i.category === 'salary').length === 1) {
    add({ id: 'filingRequired', metric: 'sideIncome', threshold: fl.sideIncomeMax, label: '所得税の確定申告が必要になる可能性（給与以外の所得が20万円超）', detail: `給与以外の所得の合計が${fl.sideIncomeMax.toLocaleString('ja-JP')}円を超えると（給与1か所の場合。住民税の申告は別に必要な場合があります）`, source: '国税庁 No.1900', noTaxEffect: true });
  }
  return walls.sort((a, b) => a.threshold - b.threshold);
}

// 資料が未確認のため対象外の「壁」（画面に明示する）
export const UNSUPPORTED_WALLS = [
  '社会保険の扶養の年収要件（いわゆる106万円・130万円の壁）',
  '国民健康保険料の軽減判定',
  '配偶者・扶養親族側の所得の壁（本人の追加収入のシミュレーションでは扱いません）',
];
