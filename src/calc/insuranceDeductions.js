// 生命保険料控除・地震保険料控除の自動計算（所得税・住民税）。表・限度額は年度別税制データ（rules.deductions.*.insurance）から読む。
// 表は [{ upTo, rate, add }]（控除額 = 支払保険料×rate + add、最後は upTo: null）。1円未満の端数は切り上げる（要確認。unverified に記録）。
const amountOf = (premium, table) => {
  if (!(premium > 0)) return 0;
  const b = table.find((x) => x.upTo == null || premium <= x.upTo);
  return Math.ceil(premium * b.rate + b.add - 1e-9);
};

// 生命保険料 or 個人年金保険料（新契約と旧契約の組み合わせ）。special = 23歳未満の扶養親族がいる場合の新生命保険料の特例表を使う。
function newOldDeduction(newP, oldP, cfg, special) {
  const n = newP > 0 ? amountOf(newP, special ? cfg.newLifeUnder23.table : cfg.newTable) : 0;
  const o = oldP > 0 ? amountOf(oldP, cfg.oldTable) : 0;
  if (newP > 0 && oldP > 0) {
    if (special) return Math.min(n + o, cfg.newLifeUnder23.bothSumMax);
    const oldBasis = cfg.bothRule.oldBasis === 'premium' ? oldP : o;
    return oldBasis > cfg.bothRule.oldOver ? Math.min(o, cfg.oldOnlyMax) : Math.min(n + o, cfg.bothSumMax);
  }
  if (oldP > 0) return Math.min(o, cfg.oldOnlyMax);
  return n;
}

export function lifeInsuranceDeduction(p, cfg, { under23 = false } = {}) {
  const special = under23 && !!cfg.newLifeUnder23;
  const life = newOldDeduction(p.newLife, p.oldLife, cfg, special);
  const pension = newOldDeduction(p.newPension, p.oldPension, cfg, false);
  const care = amountOf(p.newCare, cfg.newTable);
  return Math.min(cfg.totalMax, life + pension + care);
}

export function earthquakeDeduction(p, cfg) {
  return Math.min(cfg.totalMax, amountOf(p.quake, cfg.quakeTable) + amountOf(p.oldLongTerm, cfg.oldLongTable));
}
