// 「いまの状況」: 追加収入があと何円までなら状態が変わらないか。期待値は税制データの数値から手計算。
import { describe, expect, it } from 'vitest';
import { situation } from '../src/calc/situation.js';
import { defaultState, newIncome } from '../src/core/schema.js';
import { getTaxYear } from '../src/data/taxYears/index.js';

const rules = getTaxYear(2025);
const mk = (o = {}) => {
  const s = defaultState();
  s.taxYear = 2025;
  s.insurance = { type: 'none', actualAnnual: null, monthlyPremium: null, nationalPension: false };
  s.incomes = [];
  return Object.assign(s, o);
};

describe('FXの利益があと何円までか（本人のみ・収入なし）', () => {
  it('所得税0円のまま: 基礎控除95万円（令和7年分・合計所得132万円以下）まで。それ以上は所得税がかかる', () => {
    const r = situation(mk(), rules, 'fx');
    const m = r.marks.find((x) => x.id === 'incomeTax');
    // 所得税の課税所得 = FX − 95万円。1,000円未満切捨てで課税所得が0 → 税額0。95万円+999円まで0円、95万円+1,000円で課税所得1,000円
    expect(m.margin).toBeGreaterThanOrEqual(950_000);
    expect(m.margin).toBeLessThanOrEqual(950_999 + 1000);
  });
  it('住民税が非課税でなくなる: 本人のみ（扶養なし）の限度額 35万円×1+10万円 = 45万円を超えるとき', () => {
    const r = situation(mk(), rules, 'fx');
    const m = r.marks.find((x) => x.id === 'residentNonTaxable');
    expect(m.margin).toBe(450_000);
  });
  it('住民税の非課税（均等割も所得割も0）を外れるのは、所得割の限度（扶養なしでは同額）を超えたとき', () => {
    const r = situation(mk(), rules, 'fx');
    expect(r.base.exemption).toBe('all');
    expect(r.marks.find((x) => x.id === 'residentLevyNonTaxable').margin).toBe(450_000);
  });
});

describe('控除のクッションと「非課税」は別の話', () => {
  it('同居の特別障害者の親を扶養に入れると、所得税0円の範囲は広がるが、住民税の非課税の範囲は先に尽きる', () => {
    const s = mk();
    s.dependents = [{ id: 'p', name: '', relationship: 'parent', age: 72, cohabiting: true, income: 500_000, disability: 'special' }];
    const r = situation(s, rules, 'fx');
    const it = r.marks.find((x) => x.id === 'incomeTax').margin;
    const nt = r.marks.find((x) => x.id === 'residentNonTaxable').margin;
    // 所得税の控除: FXが132万円を超えると合計所得が増えて基礎控除は95万円→88万円に下がる（令和7年分・132万円超336万円以下）。
    // 基礎88万円＋同居老親等58万円＋同居特別障害者75万円 = 221万円。FXが221万円以下なら課税所得は0（クッションは固定ではない）
    expect(it).toBeGreaterThanOrEqual(2_210_000);
    expect(it).toBeLessThanOrEqual(2_210_999 + 1000);
    // 住民税の非課税限度: 35万円×(本人+親=2人)+10万円+21万円（扶養あり）= 101万円。FXの所得は合計所得金額に含まれる
    expect(nt).toBe(1_010_000);
    expect(nt).toBeLessThan(it);
  });
  it('扶養控除のない16歳未満の子だけでも、非課税限度の人数には数える（35万円×4人+10万円+21万円 = 171万円）', () => {
    const s = mk();
    s.dependents = [1, 2, 3].map((i) => ({ id: `d${i}`, name: '', relationship: 'child', age: 10, cohabiting: true, income: 0, disability: 'none' }));
    const r = situation(s, rules, 'fx');
    expect(r.marks.find((x) => x.id === 'residentNonTaxable').margin).toBe(1_710_000);
    expect(r.marks.find((x) => x.id === 'incomeTax').margin).toBeLessThan(1_710_000); // 所得税の控除は基礎95万円のみ
  });
});
