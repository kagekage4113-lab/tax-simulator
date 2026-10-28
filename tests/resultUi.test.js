// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resultSection } from '../src/ui/sections.js';
import { defaultState, newIncome } from '../src/core/schema.js';
import { syntheticRules } from './fixtures/syntheticRules.js';

const cells = (el) => Object.fromEntries([...el.querySelectorAll('table.summary tr')].map((tr) => [tr.querySelector('th').textContent.replace(/概算|実額|手入力値/g, '').trim(), tr.querySelector('td').textContent]));

describe('結果画面', () => {
  it('令和7年分（実データ）: 手取りまで表示する（給与500万・社保実額70万 → 手計算で手取り3,931,470円）', () => {
    const s = defaultState();
    s.taxYear = 2025;
    s.insurance = { type: 'employee', actualAnnual: 700_000 };
    s.incomes = [{ ...newIncome('salary'), amount: 5_000_000 }];
    const el = resultSection();
    el.update(s);
    const c = cells(el);
    expect(c['所得税（復興税含む）']).toBe('123,030円');
    expect(c['住民税（翌年度分）']).toBe('245,500円'); // 調整控除2,500円を含む。均等割は東京23区の5,000円
    expect(c['年間手取り']).toBe('3,931,470円');
    expect(el.textContent).toMatch(/端数処理/); // 前提の注記が画面に出る
    expect(el.textContent).not.toMatch(/未登録または未入力のため/);
  });
  it('令和8年分: 給与300万・社保なし → 手計算で手取り2,788,471円（住民税の控除額は令和8年度で代用と明記）', () => {
    // 給与所得=3,000,000-(0.3*3,000,000+80,000=980,000)=2,020,000 / 所得税: 基礎1,040,000 → 課税980,000 → 5%=49,000 / 復興floor(1,029)=1,029 → 50,029
    // 住民税: 基礎430,000 → 課税1,590,000 → 159,000 - 調整控除2,500 + 5,000 = 161,500 / 手取り=3,000,000-50,029-161,500=2,788,471
    const s = defaultState();
    s.taxYear = 2026;
    s.insurance = { type: 'none', actualAnnual: null };
    s.incomes = [{ ...newIncome('salary'), amount: 3_000_000 }];
    const el = resultSection();
    el.update(s);
    const c = cells(el);
    expect(c['所得税（復興税含む）']).toBe('50,029円');
    expect(c['住民税（翌年度分）']).toBe('161,500円');
    expect(c['年間手取り']).toBe('2,788,471円');
    expect(el.textContent).toMatch(/令和9年度/);
  });
  it('東京23区（新規の既定）: 均等割は5,000円（特別区民税3,000＋都民税1,000＋森林環境税1,000）。令和7年分 給与500万・社保実額70万 → 手取り3,931,470円', () => {
    const s = defaultState();
    s.taxYear = 2025;
    s.insurance = { type: 'employee', actualAnnual: 700_000 };
    s.incomes = [{ ...newIncome('salary'), amount: 5_000_000 }];
    const el = resultSection();
    el.update(s);
    const c = cells(el);
    expect(c['所得税（復興税含む）']).toBe('123,030円');
    expect(c['住民税（翌年度分）']).toBe('245,500円');
    expect(c['年間手取り']).toBe('3,931,470円');
    expect(el.textContent).toMatch(/東京23区/);
  });
  it('会社員で社保実額が未入力でも、協会けんぽの料率で概算して手取りを出す', () => {
    const s = defaultState();
    s.taxYear = 2025;
    s.residence.prefecture = '広島県';
    s.incomes = [{ ...newIncome('salary'), amount: 4_800_000 }];
    const el = resultSection();
    el.update(s);
    expect(cells(el)['社会保険料']).toBe('695,436円');
    expect(cells(el)['年間手取り']).not.toBe('—');
    expect(el.textContent).toMatch(/協会けんぽ/);
  });
  it('国保（個人事業主）は国保税＋国民年金で概算し、二次情報の注意書きを出す', () => {
    const s = defaultState();
    s.taxYear = 2025;
    s.insurance = { type: 'national', actualAnnual: null };
    s.incomes = [{ ...newIncome('business'), amount: 3_000_000 }];
    const el = resultSection();
    el.update(s);
    expect(cells(el)['社会保険料']).toMatch(/円$/);
    expect(cells(el)['年間手取り']).not.toBe('—');
    expect(el.textContent).toMatch(/二次情報/);
    expect(el.textContent).toMatch(/国民年金/);
  });
  it('ふるさと納税の寄附上限額（目安）を表示する（令和7年分・給与500万円・社保70万円 → 62,283円）', () => {
    const s = defaultState();
    s.taxYear = 2025;
    s.insurance = { type: 'employee', actualAnnual: 700_000 };
    s.incomes = [{ ...newIncome('salary'), amount: 5_000_000 }];
    const el = resultSection();
    el.update(s);
    expect(el.textContent).toMatch(/ふるさと納税の寄附上限額（目安）/);
    expect(el.textContent).toMatch(/62,283円/);
    expect(el.textContent).toMatch(/二次情報/);
  });
  it('給与所得者の確定申告の要否（参考）を表示する', () => {
    const s = defaultState();
    s.taxYear = 2025;
    s.insurance = { type: 'none', actualAnnual: null };
    s.incomes = [{ ...newIncome('salary'), amount: 5_000_000 }, { ...newIncome('misc'), amount: 300_000 }];
    const el = resultSection();
    el.update(s);
    expect(el.textContent).toMatch(/確定申告の要否（参考）/);
    expect(el.textContent).toMatch(/確定申告が必要になる可能性/);
    expect(el.textContent).toMatch(/断定するものではありません/);
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
    expect(el.textContent).toMatch(/未登録または未入力のため/);
    expect(el.textContent).toMatch(/所得税の税率表/);
  });
});
