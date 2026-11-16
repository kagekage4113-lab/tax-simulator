import { describe, it, expect } from 'vitest';
import { defaultState } from '../src/core/schema.js';
import { summaryRows } from '../src/ui/inputSummary.js';

const get = (rows, label) => rows.find((r) => r.label.startsWith(label));

describe('入力のまとめ', () => {
  it('入力した内容が、日本語の一覧になる（東京都・34歳・給与480万円）', () => {
    const s = defaultState(); s.residence.prefecture = '東京都'; s.self.age = 34; s.incomes[0].amount = 4_800_000;
    const rows = summaryRows(s);
    expect(get(rows, 'お住まい').value).toBe('東京都');
    expect(get(rows, '年齢').value).toBe('34歳');
    expect(get(rows, '給与収入').value).toBe('4,800,000円');
    expect(get(rows, '健康保険').value).toContain('会社員');
    expect(get(rows, '年金').value).toBe('健康保険に合わせる');
    expect(get(rows, '配偶者').value).toBe('なし');
    expect(get(rows, '扶養親族').value).toBe('なし');
    expect(get(rows, '手入力の控除').value).toBe('なし');
  });
  it('都道府県が未選択のときは、未選択と出して、赤く示す', () => {
    const s = defaultState(); s.residence.prefecture = '';
    const r = get(summaryRows(s), 'お住まい');
    expect(r.value).toBe('未選択'); expect(r.miss).toBe(true);
  });
  it('事業収入は経費も出し、手入力の控除は金額の入ったものだけ出す', () => {
    const s = defaultState(); s.incomes[0].category = 'business'; s.incomes[0].amount = 3_000_000; s.incomes[0].expenses = 500_000;
    s.deductions.smallBusinessMutualAid.amount = 240_000;
    const rows = summaryRows(s);
    expect(get(rows, '事業収入').value).toBe('3,000,000円 ／ 経費 500,000円');
    expect(get(rows, '手入力の控除').value).toContain('240,000円');
  });
  it('年金を別に選ぶと、その選択が出る', () => {
    const s = defaultState(); s.insurance.pension = 'kokumin';
    expect(get(summaryRows(s), '年金').value).toContain('国民年金');
  });
});
