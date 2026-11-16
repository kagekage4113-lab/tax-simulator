import { describe, it, expect } from 'vitest';
import { calculate } from '../src/calc/engine.js';
import { defaultState, validateState } from '../src/core/schema.js';
import { rulesOf } from '../src/data/taxYears/index.js';

// 健康保険と年金を別々に選べる（給与収入があっても厚生年金とは限らない）
const base = (over = {}) => {
  const s = defaultState(); s.taxYear = 2026; s.incomes[0].amount = 4_800_000; s.self.age = 34;
  Object.assign(s.insurance, over); return s;
};
const total = (s) => calculate(s, rulesOf(s)).socialInsurance.total;

describe('社会保険の分岐', () => {
  it('年金が auto のとき、従来の会社員の計算（画面で確認済みの値）と変わらない', () => {
    expect(total(base())).toBe(696_978); // 東京・年収480万円・34歳（従来の画面の値）
  });
  it('会社員の健保でも、年金を「国民年金」にすると、厚生年金分が国民年金に置き換わる', () => {
    const a = total(base());
    const b = total(base({ pension: 'kokumin' }));
    expect(b).not.toBe(a);
    expect(b).toBeLessThan(a); // 厚生年金（報酬比例）より国民年金（定額）が小さい
  });
  it('年金を「保険料なし」にすると、健康保険分だけになる', () => {
    const a = total(base());
    const none = total(base({ pension: 'none' }));
    const kosei = total(base({ pension: 'kosei' }));
    expect(none).toBeLessThan(a);
    expect(kosei).toBe(a);
  });
  it('実額を入力したときは、年金の選択に関係なく実額を使う', () => {
    expect(total(base({ pension: 'none', actualAnnual: 123_456 }))).toBe(123_456);
  });
  it('保存データに pension がない（古いデータ）ときは auto として読み込む', () => {
    const old = defaultState(); delete old.insurance.pension;
    const r = validateState(JSON.parse(JSON.stringify(old)));
    expect((r.state || r.value || r).insurance.pension).toBe('auto');
  });
});
