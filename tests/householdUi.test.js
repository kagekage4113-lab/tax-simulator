// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { householdSection } from '../src/ui/household.js';
import { defaultState, newIncome } from '../src/core/schema.js';
import { validateState } from '../src/core/schema.js';
import { applyHousehold } from '../src/interview/assess.js';
import { getTaxYear } from '../src/data/taxYears/index.js';
import { newPerson } from '../src/core/household.js';

const storeOf = (state) => ({ get: () => state, update: (fn) => fn(state) });
// テスト用の世帯: 親2人（事業収入・厚生年金）、本人39歳、子15歳と13歳。同居・生計・手帳は未回答のまま。
function loadFixture(s) {
  const mk = (kind, o) => ({ ...newPerson(kind), ...o });
  s.self.age = 39;
  s.household = { enabled: true, me: { certificate: 'none', partner: null, childClaimedElsewhere: null }, people: [
    mk('parent', { name: '親A', age: 72, incomeKind: 'business', revenue: 500_000, certificate: 'unknown', medical: true }),
    mk('parent', { name: '親B', age: 73, incomeKind: 'pension', revenue: 1_940_000 }),
    mk('child', { name: '子', age: 15 }),
    mk('child', { name: '子', age: 13 }),
  ] };
  applyHousehold(s, getTaxYear(s.taxYear));
}
const click = (el, text) => [...el.querySelectorAll('button')].find((b) => b.textContent.includes(text)).click();

describe('世帯（かんたん入力）の画面', () => {
  it('サンプル入力のボタンはなく、世帯を入れると判定が出る', () => {
    const s = defaultState();
    s.household.enabled = true;
    const el = householdSection(storeOf(s));
    expect(el.textContent).not.toMatch(/例の世帯|母72|透析/);
    loadFixture(s);
    expect(s.household.people).toHaveLength(4);
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

describe('データの保存・読み込み（共有・ダウンロード・コピー・貼り付け）', () => {
  const btn = (el, text) => [...el.querySelectorAll('button')].find((b) => b.textContent.includes(text));
  const mkStore = (s) => { const t = { replaced: null, get: () => s, replace: (n) => { t.replaced = n; } }; return t; };
  it('共有メニューが使える端末（スマホ）ではファイルを共有して保存する', async () => {
    const s = defaultState();
    const shared = [];
    Object.defineProperty(globalThis.navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(globalThis.navigator, 'share', { configurable: true, value: async (d) => { shared.push(d); } });
    const el = dataSection(mkStore(s));
    btn(el, 'バックアップを保存').click();
    await new Promise((r) => setTimeout(r, 10));
    expect(shared).toHaveLength(1);
    expect(shared[0].files[0].name).toMatch(/^tax-simulator-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(await shared[0].files[0].text()).app).toBe('tax-simulator');
    expect(el.textContent).toMatch(/保存しました/);
    delete globalThis.navigator.canShare; delete globalThis.navigator.share;
  });
  it('共有できない環境ではダウンロードし、「テキストでコピー」で内容が欄に出て、貼り付けて読み込める', async () => {
    const s = defaultState();
    s.household.enabled = true;
    globalThis.URL.createObjectURL ??= () => 'blob:x';
    globalThis.URL.revokeObjectURL ??= () => {};
    const store = mkStore(s);
    const el = dataSection(store);
    const box = el.querySelector('textarea[readonly]');
    expect(box.hidden).toBe(true);
    btn(el, 'バックアップを保存').click();
    await new Promise((r) => setTimeout(r, 10));
    expect(el.textContent).toMatch(/保存しました/);
    btn(el, 'テキストでコピー').click();
    await new Promise((r) => setTimeout(r, 10));
    expect(JSON.parse(box.value).app).toBe('tax-simulator');
    const paste = el.querySelector('textarea:not([readonly])');
    paste.value = buildExport(s);
    btn(el, '貼り付けた内容').click();
    expect(store.replaced.household.enabled).toBe(true);
    paste.value = '{ばらばら';
    btn(el, '貼り付けた内容').click();
    expect(el.textContent).toMatch(/読み込めませんでした/);
  });
  it('「コピーしたものを読み込む」はクリップボードの内容を読み込む', async () => {
    const s = defaultState(); s.self.age = 51;
    const store = mkStore(defaultState());
    Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { readText: async () => buildExport(s), writeText: async () => {} } });
    const el = dataSection(store);
    btn(el, 'コピーしたものを読み込む').click();
    await new Promise((r) => setTimeout(r, 10));
    expect(store.replaced.self.age).toBe(51);
    expect(el.textContent).toMatch(/読み込みました/);
  });
  it('ファイルの種類（拡張子）を限定せずに選べる', () => {
    const el = dataSection(mkStore(defaultState()));
    expect(el.querySelector('input[type=file]').hasAttribute('accept')).toBe(false);
  });
});

describe('入力の初期化は「はい／いいえ」で確認する', () => {
  const btn = (el, text) => [...el.querySelectorAll('button')].find((b) => b.textContent.includes(text));
  it('押しただけでは消えない。「いいえ」で何も変えず、「はい」で初期化する', () => {
    const s = defaultState(); s.self.age = 61;
    let replaced = null;
    const el = dataSection({ get: () => s, replace: (n) => { replaced = n; } });
    const q = el.querySelector('.confirm');
    expect(q.hidden).toBe(true);
    btn(el, '入力を初期化').click();
    expect(q.hidden).toBe(false);
    expect(replaced).toBeNull();
    expect(q.textContent).toMatch(/元に戻せません/);
    btn(el, 'いいえ').click();
    expect(q.hidden).toBe(true);
    expect(replaced).toBeNull();
    btn(el, '入力を初期化').click();
    btn(el, 'はい、初期化する').click();
    expect(q.hidden).toBe(true);
    expect(replaced.self.age).toBe(defaultState().self.age);
    expect(el.textContent).toMatch(/初期化しました/);
  });
});

describe('住民税の注記', () => {
  it('非課税判定を実装済みの年度では「非課税判定は未反映」と書かない', async () => {
    const { calculate } = await import('../src/calc/engine.js');
    const s = defaultState();
    s.incomes[0].amount = 3_000_000;
    const r = calculate(s, getTaxYear(2025));
    expect(r.notes.some((n) => n.includes('非課税判定は未反映'))).toBe(false);
    expect(r.notes.some((n) => n.startsWith('住民税は東京23区'))).toBe(true);
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
  it('世帯を入れると、未回答の欄が missing として示され、上部に件数の一覧が出る', () => {
    const s = defaultState();
    s.household.enabled = true;
    const st = storeOf(s);
    loadFixture(s);
    const el = householdSection(st);
    expect(el.querySelectorAll('.field.missing').length).toBeGreaterThan(3);
    expect(el.querySelector('.miss-box').textContent).toMatch(/まだ答えていない項目が\d+件/);
    expect(el.querySelector('.miss-count').textContent).toMatch(/未回答 \d+件/);
  });
  it('答えると赤が消える（はい／いいえを押す）', () => {
    const s = defaultState();
    s.household.enabled = true;
    const st = storeOf(s);
    loadFixture(s);
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

describe('住民税・国保の基準は東京23区だけ', () => {
  it('設定画面に地域の選択欄は出ない。世帯が有効なときの重複した注記も出ない', async () => {
    const { settingsSection } = await import('../src/ui/sections.js');
    const s = defaultState();
    const t = settingsSection(storeOf(s)).textContent;
    expect(t).not.toMatch(/福山/);
    expect(t).not.toMatch(/住民税・国保の基準/);
    expect(t).not.toMatch(/上の「世帯・家族/);
  });
});

import { cushionSection } from '../src/ui/cushion.js';
describe('控除と余裕（クッション）の画面', () => {
  const mkState = (incomes) => {
    const s = defaultState();
    s.taxYear = 2026;
    s.insurance = { type: 'none', actualAnnual: null, monthlyPremium: null, nationalPension: false };
    s.incomes = incomes;
    return s;
  };
  it('給与300万円・単身: 基礎控除 所得税104万円・住民税43万円。課税される所得は98万円・159万円、余りなし（手計算）', () => {
    // 給与所得 = 300万 − (30%+8万=98万) = 202万。所得税の課税所得 = 202万−104万 = 98万、住民税 = 202万−43万 = 159万
    const el = cushionSection(storeOf(mkState([{ ...newIncome('salary'), amount: 3_000_000 }])));
    const t = el.textContent;
    expect(t).toMatch(/基礎控除/);
    expect(t).toContain('1,040,000円');
    expect(t).toContain('430,000円');
    expect(t).toContain('980,000円');
    expect(t).toContain('1,590,000円');
    expect(t).toMatch(/控除の余り（クッション）0円0円/);
  });
  it('FXの利益35万円のみ: 所得税の控除の余り = 104万円 − 35万円 = 69万円。あと約69万円まで所得税0円', () => {
    const el = cushionSection(storeOf(mkState([{ ...newIncome('fx'), amount: 350_000 }])));
    const t = el.textContent;
    expect(t).toContain('690,000円');
    expect(t).toMatch(/所得税が0円のまま: あと69(\.\d)?万円まで/);
  });
  it('基礎控除が下がる段差（令和8年分: 合計所得489万円超で67万円）を説明に出す', () => {
    const el = cushionSection(storeOf(mkState([{ ...newIncome('fx'), amount: 350_000 }])));
    expect(el.textContent).toMatch(/合計所得が489万円を超えると104万円から67万円に下がります/);
  });
});
