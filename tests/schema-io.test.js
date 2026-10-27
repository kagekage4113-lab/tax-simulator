import { beforeEach, describe, expect, it } from 'vitest';
import { DATA_VERSION, defaultState, newDependent, newIncome, validateState } from '../src/core/schema.js';
import { buildExport, parseImport } from '../src/io/exchange.js';
import { BACKUP_KEY, STORAGE_KEY, loadState, saveState } from '../src/core/storage.js';
import { INCOME_CATEGORIES } from '../src/data/incomeCategories.js';
import { MANUAL_DEDUCTIONS } from '../src/data/deductions.js';
import { getTaxYear } from '../src/data/taxYears/index.js';

// 収入・扶養親族の id は生成のたびに変わるため、比較時は除く
const noIds = (st) => JSON.parse(JSON.stringify(st, (k, v) => (k === 'id' ? undefined : v)));

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), _m: m };
};

describe('設定データの構造', () => {
  it('収入区分は課税方式・計算モジュールの定義を持つ', () => {
    for (const c of INCOME_CATEGORIES) {
      expect(c).toHaveProperty('taxMethod');
      expect(c).toHaveProperty('computeModule');
      expect(c).toHaveProperty('supported');
    }
    expect(INCOME_CATEGORIES.find((c) => c.id === 'fx').taxMethod).toBe('separate');
    expect(INCOME_CATEGORIES.find((c) => c.id === 'securities').supported).toBe(false);
  });
  it('年度データは未確認項目を記録し、税率を推測で入れていない', () => {
    for (const y of [2025, 2026]) {
      const ty = getTaxYear(y);
      expect(ty.status).toBe('skeleton');
      expect(ty.incomeTax.brackets).toBeNull();
      expect(ty.unverified.length).toBeGreaterThan(0);
    }
  });
});

describe('validateState', () => {
  it('既定値は有効', () => {
    const r = validateState(defaultState());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it('扶養親族・収入を複数持てる', () => {
    const s = defaultState();
    s.dependents.push(newDependent(), newDependent());
    s.incomes.push(newIncome('business'), newIncome('fx'));
    const r = validateState(JSON.parse(JSON.stringify(s)));
    expect(r.ok).toBe(true);
    expect(r.state.dependents).toHaveLength(2);
    expect(r.state.incomes).toHaveLength(3);
  });
  it('FXの損失（負数）は許可、給与の負数は拒否', () => {
    const s = defaultState();
    s.incomes = [{ ...newIncome('fx'), amount: -300000 }];
    expect(validateState(s).ok).toBe(true);
    s.incomes = [{ ...newIncome('salary'), amount: -1 }];
    expect(validateState(s).ok).toBe(false);
  });
  it.each([
    ['小数の金額', (s) => { s.incomes[0].amount = 1.5; }],
    ['文字列の金額', (s) => { s.incomes[0].amount = '100'; }],
    ['未知の収入区分', (s) => { s.incomes[0].category = 'nope'; }],
    ['未知の障害区分', (s) => { s.self.disability = 'x'; }],
    ['青色控除が不正', (s) => { s.filing.blueDeduction = 50; }],
    ['未対応の年', (s) => { s.taxYear = 1999; }],
    ['年齢が範囲外', (s) => { s.self.age = 500; }],
    ['配列でない収入', (s) => { s.incomes = {}; }],
  ])('不正: %s', (_, mutate) => {
    const s = defaultState();
    mutate(s);
    expect(validateState(s).ok).toBe(false);
  });
  it('オブジェクトでない入力を拒否する', () => {
    expect(validateState(null).ok).toBe(false);
    expect(validateState([]).ok).toBe(false);
    expect(validateState('x').ok).toBe(false);
  });
  it('手入力控除の欄が控除設定データから生成される（医療費は支払額・補填額）', () => {
    const s = defaultState();
    for (const d of MANUAL_DEDUCTIONS) expect(s.deductions).toHaveProperty(d.id);
    expect(Object.keys(s.deductions.medical).sort()).toEqual(['paid', 'reimbursed']);
  });
});

describe('JSON エクスポート/インポート', () => {
  it('往復で内容が一致する（正常な復元）', () => {
    const s = defaultState();
    s.dependents.push({ ...newDependent(), name: '長男', age: 19, income: 90000, disability: 'special' });
    s.incomes.push({ ...newIncome('fx'), amount: -123456 });
    s.spouse = { exists: true, income: 480000, disability: 'general', cohabiting: false };
    s.insurance.actualAnnual = 345678;
    const r = parseImport(buildExport(s));
    expect(r.ok).toBe(true);
    expect(r.state).toEqual(s);
  });
  it.each([
    ['空文字', ''],
    ['壊れたJSON', '{not json'],
    ['別アプリ', JSON.stringify({ app: 'other', version: 1, data: {} })],
    ['未来のバージョン', JSON.stringify({ app: 'tax-simulator', version: DATA_VERSION + 1, data: {} })],
    ['バージョン不正', JSON.stringify({ app: 'tax-simulator', version: 'a', data: {} })],
    ['dataが不正', JSON.stringify({ app: 'tax-simulator', version: 1, data: { incomes: 'x' } })],
    ['dataが配列', JSON.stringify({ app: 'tax-simulator', version: 1, data: [] })],
  ])('不正なJSONを拒否: %s', (_, text) => {
    expect(parseImport(text).ok).toBe(false);
  });
  it('サイズ過大を拒否', () => {
    expect(parseImport('x'.repeat(5_000_001)).ok).toBe(false);
  });
});

describe('localStorage', () => {
  let st;
  beforeEach(() => { st = memStorage(); });

  it('保存→復元', () => {
    const s = defaultState();
    s.self.age = 45;
    expect(saveState(s, st)).toBe(true);
    expect(loadState(st).state.self.age).toBe(45);
  });
  it('保存データなしなら初期状態', () => {
    const r = loadState(st);
    expect(r.notice).toBeNull();
    expect(noIds(r.state)).toEqual(noIds(defaultState()));
  });
  it('壊れたデータでも起動でき、元データを退避する', () => {
    st.setItem(STORAGE_KEY, '{broken');
    const r = loadState(st);
    expect(noIds(r.state)).toEqual(noIds(defaultState()));
    expect(r.notice).toMatch(/壊れて/);
    expect(st.getItem(BACKUP_KEY)).toBe('{broken');
  });
  it('一部の項目だけ不正なら、その項目のみ初期値に戻して起動する', () => {
    const s = defaultState();
    s.self.age = 40;
    s.self.disability = 'bogus';
    st.setItem(STORAGE_KEY, JSON.stringify({ version: 1, data: s }));
    const r = loadState(st);
    expect(r.state.self.age).toBe(40);
    expect(r.state.self.disability).toBe('none');
    expect(r.notice).toBeTruthy();
  });
  it('ストレージが使えない環境でも例外を出さない', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    expect(noIds(loadState(broken).state)).toEqual(noIds(defaultState()));
    expect(saveState(defaultState(), broken)).toBe(false);
  });
});
