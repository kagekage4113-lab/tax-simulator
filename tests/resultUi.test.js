// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resultSection } from '../src/ui/sections.js';
import { defaultState, newIncome } from '../src/core/schema.js';
import { syntheticRules } from './fixtures/syntheticRules.js';

const cells = (el) => Object.fromEntries([...el.querySelectorAll('table.summary tr')].map((tr) => [tr.querySelector('th').textContent.replace(/概算|実額|手入力値/g, '').trim(), tr.querySelector('td').textContent]));

describe('結果画面', () => {
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
    const el = resultSection(); // 実際の令和7年分（骨組み）
    el.update(s);
    const c = cells(el);
    expect(c['年間手取り']).toBe('—');
    expect(c['所得税（復興税含む）']).toBe('—');
    expect(c['年間収入']).toBe('5,000,000円');
    expect(el.textContent).toMatch(/未登録のため、税額・手取りは計算できません/);
    expect(el.textContent).toMatch(/所得税の税率表/);
  });
});
