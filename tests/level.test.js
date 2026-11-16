import { describe, it, expect } from 'vitest';
import { defaultState } from '../src/core/schema.js';
import { rulesOf } from '../src/data/taxYears/index.js';
import { levelInfo, savingByDeduction } from '../src/calc/level.js';

// 期待値は手計算（令和8年分・東京・34歳・給与300万円のみ）
//   給与所得 202万円、基礎控除104万円、社保控除441,987円 → 課税所得 538,000円（所得税5%）
const st = (salary) => { const s = defaultState(); s.taxYear = 2026; s.incomes[0].amount = salary; s.self.age = 34; return s; };

describe('いまの位置と次のレベル', () => {
  it('課税所得53.8万円は税率5%で、次の10%まであと141.2万円', () => {
    const s = st(3_000_000); const L = levelInfo(s, rulesOf(s));
    expect(L.taxable).toBe(538_000);
    expect(L.rate).toBe(0.05);
    expect(L.nextRate).toBe(0.1);
    expect(L.toNext).toBe(1_950_000 - 538_000);
    expect(L.residentRate).toBe(0.1);
  });
  it('1万円増えたときの税金: 5%区分は、所得税510円(復興税込み)＋住民税1,000円の約1,510円', () => {
    const s = st(3_000_000); const L = levelInfo(s, rulesOf(s));
    expect(L.nowPerMan).toBe(Math.round(10_000 * (0.05 * 1.021 + 0.1)));
    expect(L.nowPerMan).toBe(1_511);
    expect(L.nextPerMan).toBe(Math.round(10_000 * (0.1 * 1.021 + 0.1))); // 10%区分は2,021円
  });
  it('控除が10万円増えると、税金は 所得税5,105円＋住民税10,000円＝15,105円減る', () => {
    const s = st(3_000_000); const sv = savingByDeduction(s, rulesOf(s), 100_000);
    expect(sv.incomeTax).toBe(5_105); // (26,900→21,900)の差5,000円＋復興税105円
    expect(sv.residentTax).toBe(10_000);
    expect(sv.total).toBe(15_105);
  });
  it('課税所得がないときは、税率0%の「課税前」として扱い、控除を増やしても税金は減らない', () => {
    const s = st(1_000_000); const L = levelInfo(s, rulesOf(s));
    expect(L.untaxed).toBe(true);
    expect(L.rate).toBe(0);
    expect(savingByDeduction(s, rulesOf(s), 100_000).total).toBe(0);
  });
});
