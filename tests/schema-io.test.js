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
  it('年度データは出典と未確認項目を記録している（推測値を入れていない）', () => {
    for (const y of [2025, 2026]) {
      const ty = getTaxYear(y);
      expect(ty.status).toBe('partial');
      expect(ty.sources.length).toBeGreaterThan(0);
      expect(ty.sources.every((s) => s.localFile || s.url || s.secondary)).toBe(true);
      expect(ty.unverified.length).toBeGreaterThan(0);
      expect(ty.incomeTax.reconstructionRate).toBe(0.021); // 国税庁 No.1521 で確認
      expect(ty.sources.some((x) => x.id === 'NTA_1521')).toBe(true);
      expect(ty.fx).toMatchObject({ incomeTaxRate: 0.15, residentTaxRate: 0.05, carryForwardYears: 3 });
      expect(ty.socialInsurance.estimate.employee.schedule.reduce((a, p) => a + p.months, 0)).toBe(12);
      expect(ty.advisories.length).toBeGreaterThan(0); // 代用・概算の前提は注意書きに残す
    }
    expect(getTaxYear(2025).socialInsurance.estimate.employee.schedule[0].healthRateByPrefecture).toMatchObject({ '広島県': 0.0997, '東京都': 0.0991, '大阪府': 0.1024 });
    expect(getTaxYear(2026).socialInsurance.estimate.employee.schedule[2].healthRateByPrefecture).toMatchObject({ '広島県': 0.0978, '福岡県': 0.1011, '大阪府': 0.1013, '東京都': 0.0985, '北海道': 0.1028 });
    // 国民年金は日本年金機構（令和8年度17,920円）。国保の法定軽減は二次情報と明記
    const nat = getTaxYear(2026).socialInsurance.estimate.national;
    expect(nat.pension).toMatchObject({ monthly: 17_920 });
    expect(nat.pension.secondary).toBeUndefined();
    expect(getTaxYear(2026).sources.some((x) => x.id === 'NENKIN_PREMIUM' && x.url.includes('nenkin.go.jp'))).toBe(true);
    expect(nat.reduction.secondary).toBe(true);
    expect(nat.advisories.join()).toMatch(/法定軽減.*二次情報/);
    // 令和8年分の住民税の控除額（令和9年度）は資料がなく、令和8年度の値を代用している旨を注意書きに残す
    expect(getTaxYear(2026).advisories.join()).toMatch(/令和9年度/);
    expect(getTaxYear(2026).deductions.residentTax).toEqual(getTaxYear(2025).deductions.residentTax);
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

describe('繰越損失の入力', () => {
  it('年ごとの繰越損失を保存・検証できる', () => {
    const s = defaultState();
    s.fxCarryLosses = [{ year: 2023, amount: 100000 }, { year: 2024, amount: 50000 }];
    expect(validateState(JSON.parse(JSON.stringify(s))).ok).toBe(true);
  });
  it('旧形式の単一の繰越額は「前年に生じた損失」として読み替える', () => {
    const old = JSON.parse(JSON.stringify(defaultState()));
    delete old.fxCarryLosses;
    old.fxCarryForward = 120000;
    const r = validateState(old);
    expect(r.ok).toBe(true);
    expect(r.state.fxCarryLosses).toEqual([{ year: 2024, amount: 120000 }]);
  });
  it.each([
    ['金額が負', { year: 2024, amount: -1 }],
    ['年が小数', { year: 2024.5, amount: 1 }],
    ['年が範囲外', { year: 1800, amount: 1 }],
  ])('不正: %s', (_, l) => {
    const s = defaultState();
    s.fxCarryLosses = [l];
    expect(validateState(s).ok).toBe(false);
  });
});

describe('JSON エクスポート/インポート', () => {
  it('往復で内容が一致する（正常な復元）', () => {
    const s = defaultState();
    s.dependents.push({ ...newDependent(), name: '長男', age: 19, income: 90000, disability: 'special' });
    s.incomes.push({ ...newIncome('fx'), amount: -123456 });
    s.spouse = { exists: true, age: 41, income: 480000, disability: 'general', cohabiting: false };
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
