// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { deductionsSection, incomesSection, settingsSection } from '../src/ui/sections.js';
import { defaultState, newIncome } from '../src/core/schema.js';

const storeOf = (state) => ({ get: () => state, update: (fn) => fn(state) });

describe('入力画面の描画（全区分でエラーなく表示できる）', () => {
  it('FX・上場株式等・暗号資産・事業・不動産・給与・簡易扱いを同時に描画し、繰越損失の欄が出る', () => {
    const s = defaultState();
    s.incomes = ['salary', 'business', 'realEstate', 'misc', 'crypto', 'fx', 'listedStock', 'securities', 'other'].map((c) => ({ ...newIncome(c), amount: 100_000 }));
    s.fxCarryLosses = [{ year: 2024, amount: 50_000 }];
    s.listedCarryLosses = [{ year: 2023, amount: 30_000 }];
    const el = incomesSection(storeOf(s));
    const text = el.textContent;
    expect(text).toMatch(/FX・先物の繰越損失/);
    expect(text).toMatch(/上場株式等の繰越損失/);
    expect(text).toMatch(/NISA口座内の損益は非課税/);
    expect(el.querySelectorAll('button').length).toBeGreaterThan(5);
  });
  it('繰越損失の追加・削除が状態に反映される', () => {
    const s = defaultState();
    s.incomes = [{ ...newIncome('listedStock'), amount: 100_000 }];
    const el = incomesSection(storeOf(s));
    [...el.querySelectorAll('button')].find((b) => b.textContent.includes('繰越損失を追加')).click();
    expect(s.listedCarryLosses).toHaveLength(1);
    expect(s.fxCarryLosses).toHaveLength(0);
  });
  it('控除・設定の画面も描画できる（保険料・雑損の入力欄を含む）', () => {
    const s = defaultState();
    const d = deductionsSection(storeOf(s));
    expect(d.textContent).toMatch(/生命保険料控除/);
    expect(d.textContent).toMatch(/地震保険料控除/);
    expect(d.textContent).toMatch(/雑損控除/);
    expect(settingsSection(storeOf(s)).textContent).toMatch(/基本（年度・お住まい）/);
  });
});
