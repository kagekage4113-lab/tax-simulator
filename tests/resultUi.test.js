// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resultSection } from '../src/ui/sections.js';
import { defaultState, newIncome } from '../src/core/schema.js';
import { syntheticRules } from './fixtures/syntheticRules.js';

const cells = (el) => Object.fromEntries([...el.querySelectorAll('table.summary tr')].map((tr) => [tr.querySelector('th').textContent.replace(/概算|実額|手入力値/g, '').trim(), tr.querySelector('td').textContent]));

describe('結果画面', () => {
  it('令和7年分（実データ）: 手取りまで表示する（給与500万・社保実額70万 → 手計算で手取り3,928,470円）', () => {
    const s = defaultState();
    s.taxYear = 2025;
    s.insurance = { type: 'employee', actualAnnual: 700_000 };
    s.incomes = [{ ...newIncome('salary'), amount: 5_000_000 }];
    const el = resultSection();
    el.update(s);
    const c = cells(el);
    expect(c['所得税（復興税含む）']).toBe('123,030円');
    expect(c['住民税（翌年度分）']).toBe('248,500円');
    expect(c['年間手取り']).toBe('3,928,470円');
    expect(el.textContent).toMatch(/二次情報/); // 公式資料で未確認の値は画面にも注意書きを出す
    expect(el.textContent).not.toMatch(/税制データが未登録のため/);
  });
  it('令和8年分: 所得税は出るが、住民税の控除額が未登録のため手取りは「—」', () => {
    const s = defaultState();
    s.taxYear = 2026;
    s.insurance = { type: 'none', actualAnnual: null };
    s.incomes = [{ ...newIncome('salary'), amount: 3_000_000 }];
    const el = resultSection();
    el.update(s);
    const c = cells(el);
    expect(c['所得税（復興税含む）']).not.toBe('—');
    expect(c['年間手取り']).toBe('—');
    expect(el.textContent).toMatch(/基礎控除（住民税）/);
  });
  it('社会保険料の概算率が未登録で実額も未入力なら、その旨を表示する', () => {
    const s = defaultState();
    s.taxYear = 2025;
    s.incomes = [{ ...newIncome('salary'), amount: 3_000_000 }];
    const el = resultSection();
    el.update(s);
    expect(el.textContent).toMatch(/社会保険料の概算率/);
    expect(cells(el)['年間手取り']).toBe('—');
  });
  it('税制データがあれば手取りまで表示する（給与500万・社保概算: 手計算で手取り350万）', () => {
    const s = defaultState();
    s.incomes = [{ ...newIncome('salary'), amount: 5_000_000 }];
    const el = resultSection(() => syntheticRules);
    el.update(s);
    const c = cells(el);
    expect(c['所得税（復興税含む）']).toBe('463,000円');
    expect(c['年間負担合計']).toBe('1,500,000円');
    expect(c['年間手取り']).toBe('3,500,000円');
    expect(el.textContent).not.toMatch(/未登録/);
  });
  it('税制データ未登録なら理由を表示し、手取りは「—」（確定値のように見せない）', () => {
    const s = defaultState();
    s.incomes = [{ ...newIncome('salary'), amount: 5_000_000 }];
    const el = resultSection(() => ({ year: 1 })); // 税制データが空の年度
    el.update(s);
    const c = cells(el);
    expect(c['年間手取り']).toBe('—');
    expect(c['所得税（復興税含む）']).toBe('—');
    expect(c['年間収入']).toBe('5,000,000円');
    expect(el.textContent).toMatch(/税制データが未登録のため/);
    expect(el.textContent).toMatch(/所得税の税率表/);
  });
});
