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
    s.household.enabled = false; // 新規の既定はオン。オフのときは切り替えだけを表示する
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
    s.household.enabled = false;
    s.dependents = [{ id: 'd1', name: '', relationship: 'child', age: 20, cohabiting: true, income: 0, disability: 'none' }];
    expect(applyHousehold(s, getTaxYear(2025))).toBe(false);
    expect(s.dependents).toHaveLength(1);
  });
});

import { dataSection } from '../src/ui/dataSection.js';
import { buildExport } from '../src/io/exchange.js';

describe('データの書き出し・読み込み（ダウンロードできない環境でも使える）', () => {
  it('書き出しで内容が画面に出て、貼り付けて読み込める', async () => {
    const s = defaultState();
    s.household.enabled = true;
    s.household.people = [{ ...s.household, id: 'x' }].slice(0, 0);
    let replaced = null;
    const store = { get: () => s, replace: (n) => { replaced = n; } };
    globalThis.URL.createObjectURL ??= () => 'blob:x';
    globalThis.URL.revokeObjectURL ??= () => {};
    const el = dataSection(store);
    const box = el.querySelector('textarea[readonly]');
    expect(box.hidden).toBe(true);
    [...el.querySelectorAll('button')].find((b) => b.textContent === 'JSONを書き出す').click();
    await new Promise((r) => setTimeout(r, 10));
    expect(box.hidden).toBe(false);
    expect(JSON.parse(box.value).app).toBe('tax-simulator');
    const paste = el.querySelector('textarea:not([readonly])');
    paste.value = buildExport(s);
    [...el.querySelectorAll('button')].find((b) => b.textContent.includes('貼り付けた内容')).click();
    expect(replaced.household.enabled).toBe(true);
    paste.value = '{ばらばら';
    [...el.querySelectorAll('button')].find((b) => b.textContent.includes('貼り付けた内容')).click();
    expect(el.textContent).toMatch(/読み込めませんでした/);
  });
});

describe('住民税の注記', () => {
  it('非課税判定を実装済みの年度では「非課税判定は未反映」と書かない', async () => {
    const { calculate } = await import('../src/calc/engine.js');
    const s = defaultState();
    s.incomes[0].amount = 3_000_000;
    const r = calculate(s, getTaxYear(2025));
    expect(r.notes.some((n) => n.includes('非課税判定は未反映'))).toBe(false);
    expect(r.notes.some((n) => n.startsWith('住民税は福山市'))).toBe(true);
  });
});

import { situationSection } from '../src/ui/situation.js';
describe('いまの状況の画面', () => {
  it('FXの利益があと何円まで変わらないかと、税額0円と非課税は別という説明を表示する', async () => {
    const s = defaultState();
    s.taxYear = 2025;
    s.insurance = { type: 'none', actualAnnual: null, monthlyPremium: null, nationalPension: false };
    s.incomes = [{ ...s.incomes[0], category: 'salary', amount: 660_000 }];
    const el = situationSection(storeOf(s));
    const text = el.textContent;
    expect(text).toMatch(/所得税がかかり始める/);
    expect(text).toMatch(/住民税の「非課税」でなくなる/);
    expect(text).toMatch(/税額0円」と「非課税」は別/);
    expect(text).toMatch(/確認できていません|未確認/);
  });
});

describe('未回答の赤い表示', () => {
  it('例の世帯を入れると、未回答の欄が missing として示され、上部に件数の一覧が出る', () => {
    const s = defaultState();
    s.household.enabled = true;
    const st = storeOf(s);
    click(householdSection(st), '例の世帯を入れてみる');
    const el = householdSection(st);
    expect(el.querySelectorAll('.field.missing').length).toBeGreaterThan(3);
    expect(el.querySelector('.miss-box').textContent).toMatch(/まだ答えていない項目が\d+件/);
    expect(el.querySelector('.miss-count').textContent).toMatch(/未回答 \d+件/);
  });
  it('答えると赤が消える（はい／いいえを押す）', () => {
    const s = defaultState();
    s.household.enabled = true;
    const st = storeOf(s);
    click(householdSection(st), '例の世帯を入れてみる');
    const el = householdSection(st);
    const first = el.querySelector('.field.missing .seg');
    first.querySelector('button').click(); // はい
    expect(first.parentElement.classList.contains('missing')).toBe(false);
  });
});

describe('令和8年分だけに対応', () => {
  it('新規の既定は令和8年分。設定画面に年の選択欄は出さず、対象の年を表示する', async () => {
    const { settingsSection } = await import('../src/ui/sections.js');
    const s = defaultState();
    expect(s.taxYear).toBe(2026);
    const el = settingsSection(storeOf(s));
    expect(el.textContent).toMatch(/計算の対象: 令和8年分（2026年）/);
    expect(el.textContent).not.toMatch(/計算対象年/);
  });
  it('令和7年分のJSONを読み込むと、令和8年分に付け替えて注記を出す', async () => {
    const { buildExport } = await import('../src/io/exchange.js');
    const old = defaultState(); old.taxYear = 2025;
    let replaced = null;
    const store = { get: () => old, replace: (n) => { replaced = n; } };
    globalThis.URL.createObjectURL ??= () => 'blob:x';
    const el = dataSection(store);
    el.querySelector('textarea:not([readonly])').value = buildExport(old);
    [...el.querySelectorAll('button')].find((b) => b.textContent.includes('貼り付けた内容')).click();
    expect(replaced.taxYear).toBe(2026);
    expect(el.textContent).toMatch(/令和7年分のデータを令和8年分として読み込みました/);
  });
});

describe('住民税・国保の基準は東京23区だけ（福山市は画面から選べない）', () => {
  it('設定画面に地域の選択欄や福山市は出ない。世帯が有効なときの重複した注記も出ない', async () => {
    const { settingsSection } = await import('../src/ui/sections.js');
    const s = defaultState();
    const t = settingsSection(storeOf(s)).textContent;
    expect(t).not.toMatch(/福山/);
    expect(t).not.toMatch(/住民税・国保の基準/);
    expect(t).not.toMatch(/上の「世帯・家族/);
  });
  it('福山市の設定のJSONを読み込むと、東京23区に付け替えて注記を出す', async () => {
    const { buildExport } = await import('../src/io/exchange.js');
    const old = defaultState(); old.residence.area = 'fukuyama';
    let replaced = null;
    const el = dataSection({ get: () => old, replace: (n) => { replaced = n; } });
    el.querySelector('textarea:not([readonly])').value = buildExport(old);
    [...el.querySelectorAll('button')].find((b) => b.textContent.includes('貼り付けた内容')).click();
    expect(replaced.residence.area).toBe('tokyo23');
    expect(el.textContent).toMatch(/福山市（広島県）から東京23区（標準）に変えました/);
  });
});
