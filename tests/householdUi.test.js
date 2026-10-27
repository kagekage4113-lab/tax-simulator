// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { householdSection } from '../src/ui/household.js';
import { defaultState } from '../src/core/schema.js';
import { validateState } from '../src/core/schema.js';
import { applyHousehold } from '../src/interview/assess.js';
import { getTaxYear } from '../src/data/taxYears/index.js';

const storeOf = (state) => ({ get: () => state, update: (fn) => fn(state) });
const click = (el, text) => [...el.querySelectorAll('button')].find((b) => b.textContent.includes(text)).click();

describe('世帯（かんたん入力）の画面', () => {
  it('無効のときは切り替えだけを表示し、有効にすると例の世帯を入れて判定が出る', () => {
    const s = defaultState();
    const off = householdSection(storeOf(s));
    expect(off.textContent).not.toMatch(/例の世帯/);
    s.household.enabled = true;
    const el = householdSection(storeOf(s));
    click(el, '例の世帯を入れてみる');
    expect(s.household.people).toHaveLength(4);
    expect(s.self.age).toBe(39);
    const again = householdSection(storeOf(s));
    expect(again.textContent).toMatch(/ひとり親控除/);
    expect(again.textContent).toMatch(/要確認/);
    expect(again.textContent).toMatch(/確定分/);
  });

  it('人の追加・削除ができ、配偶者は1人まで', () => {
    const s = defaultState();
    s.household.enabled = true;
    householdSection(storeOf(s));
    click(householdSection(storeOf(s)), '＋ 配偶者を追加');
    expect(s.household.people).toHaveLength(1);
    const el = householdSection(storeOf(s));
    expect([...el.querySelectorAll('button')].find((b) => b.textContent.includes('＋ 配偶者を追加')).disabled).toBe(true);
    click(el, '削除');
    expect(s.household.people).toHaveLength(0);
  });

  it('既存の扶養親族を持つ状態で有効にすると、人に取り込まれて失われない', () => {
    const s = defaultState();
    s.dependents = [{ id: 'd1', name: '子', relationship: 'child', age: 20, cohabiting: true, income: 0, disability: 'none' }];
    const el = householdSection(storeOf(s));
    el.querySelector('input[type=checkbox]').checked = true;
    el.querySelector('input[type=checkbox]').dispatchEvent(new Event('change'));
    expect(s.household.enabled).toBe(true);
    expect(s.household.people).toHaveLength(1);
    expect(s.dependents).toHaveLength(1);
    expect(s.dependents[0].age).toBe(20);
  });

  it('世帯のデータは検証を通り、旧データ（household なし）も読み込める', () => {
    const s = defaultState();
    s.household.enabled = true;
    s.household.people = [{ ...defaultState().household, id: 'x' }].slice(0, 0);
    expect(validateState(s).ok).toBe(true);
    const old = { ...defaultState() };
    delete old.household;
    const r = validateState(old);
    expect(r.ok).toBe(true);
    expect(r.state.household.enabled).toBe(false);
    const bad = { ...defaultState(), household: { enabled: true, me: { certificate: 'xxx' }, people: [{ kind: 'alien' }] } };
    expect(validateState(bad).ok).toBe(false);
  });

  it('無効なときは applyHousehold が state を変えない', () => {
    const s = defaultState();
    s.dependents = [{ id: 'd1', name: '', relationship: 'child', age: 20, cohabiting: true, income: 0, disability: 'none' }];
    expect(applyHousehold(s, getTaxYear(2025))).toBe(false);
    expect(s.dependents).toHaveLength(1);
  });
});
