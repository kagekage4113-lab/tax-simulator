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

import { wallDefinitions } from '../src/calc/walls.js';
describe('壁の一覧: 住民税の非課税の限度（福山市）', () => {
  it('ひとり親でも、人数による限度（35万円×4人+10万円+21万円=171万円）が135万円より大きければ、そちらまで非課税', () => {
    const s = mk();
    s.self.widowSingleParent = 'singleParent';
    s.dependents = [1, 2, 3].map((i) => ({ id: `d${i}`, name: '', relationship: 'child', age: 10, cohabiting: true, income: 0, disability: 'none' }));
    const walls = wallDefinitions(s, rules).filter((w) => w.id.startsWith('nonTaxable'));
    expect(walls[0].threshold).toBe(1_710_000);
    // 所得割のみ非課税の限度: 35万円×4+10万円+32万円 = 182万円
    expect(walls[1].threshold).toBe(1_820_000);
  });
  it('扶養がいない障がい者などは135万円まで非課税', () => {
    const s = mk();
    s.self.disability = 'general';
    const walls = wallDefinitions(s, rules).filter((w) => w.id.startsWith('nonTaxable'));
    expect(walls).toHaveLength(1);
    expect(walls[0].threshold).toBe(1_350_000);
  });
});

import { calculate } from '../src/calc/engine.js';
describe('所得割の調整措置（逆転防止・東京都北区の公表式）', () => {
  // 本人＋16歳未満の子3人（扶養控除なし・扶養人数には数える）、FXの利益のみ、令和7年分、東京23区
  const st = (fx) => {
    const s = mk();
    s.residence.area = 'tokyo23';
    s.dependents = [1, 2, 3].map((i) => ({ id: `d${i}`, name: '', relationship: 'child', age: 10, cohabiting: true, income: 0, disability: 'none' }));
    s.incomes = [{ ...newIncome('fx'), amount: fx }];
    return s;
  };
  const t = rulesTokyo();
  function rulesTokyo() { return getTaxYear(2025, 'tokyo23'); }
  // 所得割の非課税の基準 A = 35万円×(1+3)+10万円+32万円 = 182万円。住民税の所得控除は基礎43万円のみ（子は16歳未満）
  it('基準ちょうど（182万円）は所得割が非課税（均等割のみ）', () => {
    const r = calculate(st(1_820_000), t);
    expect(r.residentTax.exemption).toBe('levy');
    expect(r.residentTax.total).toBe(5_000);
  });
  it('基準を1,000円超えた182.1万円: 所得割は 総所得金額等−A = 1,000円に抑えられる（減額前は 課税(182.1万−43万=139.1万)×5% = 69,550円）', () => {
    const r = calculate(st(1_821_000), t);
    expect(r.residentTax.exemption).toBeNull();
    // 調整額 = A − (B) = 1,820,000 − (1,821,000 − 69,550) = 68,550 → 所得割 69,550 − 68,550 = 1,000
    expect(r.residentTax.adjustmentMeasure).toBe(68_550);
    expect(r.residentTax.fxTax).toBe(1_000);
    expect(r.residentTax.total).toBe(1_000 + 5_000);
  });
  it('183万円: 減額前の所得割 (183万−43万=140万)×5% = 70,000円 → 調整額 60,000円 → 所得割10,000円', () => {
    const r = calculate(st(1_830_000), t);
    expect(r.residentTax.adjustmentMeasure).toBe(60_000);
    expect(r.residentTax.total).toBe(10_000 + 5_000);
  });
  it('十分に超えると調整なし: 190万円 → 所得割 (190万−43万=147万)×5% = 73,500円、B = 190万−73,500 = 1,826,500 > A', () => {
    const r = calculate(st(1_900_000), t);
    expect(r.residentTax.adjustmentMeasure).toBe(0);
    expect(r.residentTax.total).toBe(73_500 + 5_000);
  });
  it('所得割の調整措置は、手取りが非課税の人より少なくならない: 収入が増えて住民税が増える額は、増えた所得を超えない', () => {
    let prev = calculate(st(1_820_000), t).residentTax.total;
    for (let fx = 1_821_000; fx <= 1_900_000; fx += 1_000) {
      const cur = calculate(st(fx), t).residentTax.total;
      expect(cur - prev).toBeLessThanOrEqual(1_000 + 1); // 所得が1,000円増えたとき、税額の増加が所得の増加（1,000円）を超えない
      prev = cur;
    }
  });
});
