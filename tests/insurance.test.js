// 期待値は、国税庁「保険と税」（所得税）と地方税法の別表（住民税）の表から手計算。
import { describe, expect, it } from 'vitest';
import { earthquakeDeduction, lifeInsuranceDeduction } from '../src/calc/insuranceDeductions.js';
import { calculate } from '../src/calc/engine.js';
import { defaultState, newIncome } from '../src/core/schema.js';
import { getTaxYear } from '../src/data/taxYears/index.js';

const R7 = getTaxYear(2025);
const R8 = getTaxYear(2026);
const IT = R7.deductions.incomeTax.insurance.life;
const IT8 = R8.deductions.incomeTax.insurance.life;
const ITQ = R7.deductions.incomeTax.insurance.earthquake;
const RT = R7.deductions.residentTax.insurance;
const P = (o = {}) => ({ newLife: 0, newCare: 0, newPension: 0, oldLife: 0, oldPension: 0, ...o });
const Q = (o = {}) => ({ quake: 0, oldLongTerm: 0, ...o });

describe('生命保険料控除（所得税・国税庁）', () => {
  it.each([
    // 新契約（生命・介護医療・個人年金とも同じ表）: 2万円以下は全額 / 4万円以下は×1/2+1万円 / 8万円以下は×1/4+2万円 / 超は一律4万円
    [20_000, 20_000], [30_000, 25_000], [40_000, 30_000], [60_000, 35_000], [80_000, 40_000], [100_000, 40_000],
  ])('新生命保険料%i円 → %i円', (premium, expected) => expect(lifeInsuranceDeduction(P({ newLife: premium }), IT)).toBe(expected));
  it.each([
    // 旧契約: 2.5万円以下は全額 / 5万円以下は×1/2+1.25万円 / 10万円以下は×1/4+2.5万円 / 超は一律5万円
    [25_000, 25_000], [40_000, 32_500], [50_000, 37_500], [80_000, 45_000], [100_000, 50_000], [200_000, 50_000],
  ])('旧生命保険料%i円 → %i円', (premium, expected) => expect(lifeInsuranceDeduction(P({ oldLife: premium }), IT)).toBe(expected));
  it('介護医療保険料・新個人年金保険料も新契約の表', () => {
    expect(lifeInsuranceDeduction(P({ newCare: 60_000 }), IT)).toBe(35_000);
    expect(lifeInsuranceDeduction(P({ newPension: 100_000 }), IT)).toBe(40_000);
  });
  it('新契約と旧契約の双方: 旧契約が6万円以下なら合計（最高4万円）、6万円超なら旧契約のみ', () => {
    // 新60,000→35,000 + 旧30,000→27,500 = 62,500 → 最高40,000円
    expect(lifeInsuranceDeduction(P({ newLife: 60_000, oldLife: 30_000 }), IT)).toBe(40_000);
    // 旧60,000円ちょうど（6万円以下）: 新20,000→20,000 + 旧60,000→40,000 = 60,000 → 最高40,000円
    expect(lifeInsuranceDeduction(P({ newLife: 20_000, oldLife: 60_000 }), IT)).toBe(40_000);
    // 旧60,001円（6万円超）: 旧のみ ×1/4+25,000 = 40,000.25 → 40,001円（1円未満切上げ）
    expect(lifeInsuranceDeduction(P({ newLife: 20_000, oldLife: 60_001 }), IT)).toBe(40_001);
    // 旧80,000円: 旧のみ 45,000円
    expect(lifeInsuranceDeduction(P({ newLife: 60_000, oldLife: 80_000 }), IT)).toBe(45_000);
  });
  it('個人年金も同様に新旧の双方の規則（旧が6万円超なら旧のみ・最高5万円）', () => {
    expect(lifeInsuranceDeduction(P({ newPension: 60_000, oldPension: 30_000 }), IT)).toBe(40_000);
    expect(lifeInsuranceDeduction(P({ newPension: 60_000, oldPension: 200_000 }), IT)).toBe(50_000);
  });
  it('生命・介護医療・個人年金の合計は最高12万円', () => {
    expect(lifeInsuranceDeduction(P({ newLife: 100_000, newCare: 100_000, newPension: 100_000 }), IT)).toBe(120_000);
    // 旧生命100,000→50,000 + 新介護40,000 + 新年金40,000 = 130,000 → 120,000
    expect(lifeInsuranceDeduction(P({ oldLife: 100_000, newCare: 100_000, newPension: 100_000 }), IT)).toBe(120_000);
    expect(lifeInsuranceDeduction(P({ newLife: 20_000, newCare: 20_000, newPension: 20_000 }), IT)).toBe(60_000);
  });
  it('23歳未満の扶養親族がいる場合の新生命保険料の特例（令和8・9年分）: 3万円以下全額/6万円以下×1/2+1.5万円/12万円以下×1/4+3万円/超6万円', () => {
    const u = { under23: true };
    expect(lifeInsuranceDeduction(P({ newLife: 30_000 }), IT8, u)).toBe(30_000);
    expect(lifeInsuranceDeduction(P({ newLife: 60_000 }), IT8, u)).toBe(45_000);
    expect(lifeInsuranceDeduction(P({ newLife: 80_000 }), IT8, u)).toBe(50_000);
    expect(lifeInsuranceDeduction(P({ newLife: 120_000 }), IT8, u)).toBe(60_000);
    expect(lifeInsuranceDeduction(P({ newLife: 200_000 }), IT8, u)).toBe(60_000);
    // 新旧双方（特例）: 新60,000→45,000 + 旧30,000→27,500 = 72,500 → 最高6万円（旧の額にかかわらず合計）
    expect(lifeInsuranceDeduction(P({ newLife: 60_000, oldLife: 30_000 }), IT8, u)).toBe(60_000);
    // 介護医療・個人年金には特例はない
    expect(lifeInsuranceDeduction(P({ newCare: 60_000 }), IT8, u)).toBe(35_000);
    // 特例は令和7年分のデータにはない（令和8・9年分のみ）
    expect(lifeInsuranceDeduction(P({ newLife: 60_000 }), IT, u)).toBe(35_000);
  });
  it('支払がなければ0円', () => expect(lifeInsuranceDeduction(P(), IT)).toBe(0));
});

describe('地震保険料控除（所得税）', () => {
  it.each([
    [30_000, 0, 30_000], [50_000, 0, 50_000], [60_000, 0, 50_000],
    [0, 10_000, 10_000], [0, 15_000, 12_500], [0, 20_000, 15_000], [0, 30_000, 15_000],
    [40_000, 15_000, 50_000], // 40,000 + 12,500 = 52,500 → 最高5万円
    [20_000, 10_000, 30_000],
  ])('地震%i円・旧長期%i円 → %i円', (q, o, expected) => expect(earthquakeDeduction(Q({ quake: q, oldLongTerm: o }), ITQ)).toBe(expected));
});

describe('生命保険料控除・地震保険料控除（住民税）', () => {
  it.each([
    // 新: 1.2万円以下全額 / 3.2万円以下×1/2+6,000 / 5.6万円以下×1/4+14,000 / 超2.8万円
    [12_000, 12_000], [30_000, 21_000], [32_000, 22_000], [56_000, 28_000], [60_000, 28_000],
  ])('新生命保険料%i円 → %i円', (premium, expected) => expect(lifeInsuranceDeduction(P({ newLife: premium }), RT.life)).toBe(expected));
  it.each([
    // 旧: 1.5万円以下全額 / 4万円以下×1/2+7,500 / 7万円以下×1/4+17,500 / 超3.5万円
    [15_000, 15_000], [40_000, 27_500], [50_000, 30_000], [70_000, 35_000], [80_000, 35_000],
  ])('旧生命保険料%i円 → %i円', (premium, expected) => expect(lifeInsuranceDeduction(P({ oldLife: premium }), RT.life)).toBe(expected));
  it('新旧の双方: 旧契約の控除額が2.8万円以下なら合計（最高2.8万円）、超なら旧契約のみ（最高3.5万円）', () => {
    // 新40,000→24,000 + 旧20,000→17,500 = 41,500 → 最高28,000円
    expect(lifeInsuranceDeduction(P({ newLife: 40_000, oldLife: 20_000 }), RT.life)).toBe(28_000);
    // 旧50,000→30,000（2.8万円超）→ 旧のみ 30,000円
    expect(lifeInsuranceDeduction(P({ newLife: 40_000, oldLife: 50_000 }), RT.life)).toBe(30_000);
    // 旧40,000→27,500（2.8万円以下）→ 新40,000→24,000との合計 51,500 → 28,000円
    expect(lifeInsuranceDeduction(P({ newLife: 40_000, oldLife: 40_000 }), RT.life)).toBe(28_000);
  });
  it('合計の最高額は7万円', () => {
    // 旧生命100,000→35,000 + 旧年金100,000→35,000 + 新介護100,000→28,000 = 98,000 → 70,000
    expect(lifeInsuranceDeduction(P({ oldLife: 100_000, oldPension: 100_000, newCare: 100_000 }), RT.life)).toBe(70_000);
  });
  it('23歳未満の扶養親族の特例は住民税側の資料がないため適用しない', () => {
    expect(lifeInsuranceDeduction(P({ newLife: 60_000 }), RT.life, { under23: true })).toBe(28_000);
  });
  it.each([
    // 地震: 5万円以下×1/2 / 超2.5万円。旧長期: 5千円以下全額 / 1.5万円以下×1/2+2,500 / 超1万円。合計最高2.5万円
    [30_000, 0, 15_000], [50_000, 0, 25_000], [60_000, 0, 25_000],
    [0, 4_000, 4_000], [0, 10_000, 7_500], [0, 20_000, 10_000],
    [60_000, 20_000, 25_000], // 25,000 + 10,000 = 35,000 → 最高25,000円
  ])('地震%i円・旧長期%i円 → %i円', (q, o, expected) => expect(earthquakeDeduction(Q({ quake: q, oldLongTerm: o }), RT.earthquake)).toBe(expected));
});

describe('エンジンへの組み込み', () => {
  const base = (taxYear, patch = {}) => {
    const s = defaultState();
    s.taxYear = taxYear;
    s.insurance = { type: 'employee', actualAnnual: 700_000 };
    s.incomes = [{ ...newIncome('salary'), amount: 5_000_000 }];
    return Object.assign(s, patch);
  };
  const item = (r, kind, id) => r.deductions[kind].items.find((i) => i.id === id);
  it('支払保険料から自動計算し、所得税と住民税で別々の表を使う（令和7年分）', () => {
    const s = base(2025);
    s.deductions.lifeInsurance = { newLife: 60_000, newCare: 0, newPension: 0, oldLife: 0, oldPension: 0, amount: 0 };
    s.deductions.earthquakeInsurance = { quake: 30_000, oldLongTerm: 0, amount: 0 };
    const r = calculate(s, R7);
    expect(item(r, 'incomeTax', 'lifeInsurance')).toMatchObject({ amount: 35_000, mode: 'auto' });
    expect(item(r, 'residentTax', 'lifeInsurance')).toMatchObject({ amount: 28_000, mode: 'auto' });
    expect(item(r, 'incomeTax', 'earthquakeInsurance')).toMatchObject({ amount: 30_000, mode: 'auto' });
    expect(item(r, 'residentTax', 'earthquakeInsurance')).toMatchObject({ amount: 15_000, mode: 'auto' });
    // 所得税: 控除=基礎680,000+社保700,000+生保35,000+地震30,000=1,445,000 → 課税=3,560,000-1,445,000=2,115,000 → 211,500-97,500=114,000, 復興2,394 → 116,394
    expect(r.deductions.incomeTax.total).toBe(1_445_000);
    expect(r.incomeTax.total).toBe(116_394);
  });
  it('控除額を直接入力すると自動計算より優先され、手入力値として扱う', () => {
    const s = base(2025);
    s.deductions.lifeInsurance = { newLife: 60_000, newCare: 0, newPension: 0, oldLife: 0, oldPension: 0, amount: 50_000 };
    const r = calculate(s, R7);
    expect(item(r, 'incomeTax', 'lifeInsurance')).toMatchObject({ amount: 50_000, mode: 'manual' });
    expect(item(r, 'residentTax', 'lifeInsurance')).toMatchObject({ amount: 50_000, mode: 'manual' });
  });
  it('23歳未満の扶養親族がいると、令和8年分の所得税で新生命保険料の特例表を使う（住民税は通常の表）', () => {
    const s = base(2026);
    s.dependents = [{ ...{ id: 'x', name: '', relationship: 'child', age: 20, cohabiting: true, income: 0, disability: 'none' } }];
    s.deductions.lifeInsurance = { newLife: 60_000, newCare: 0, newPension: 0, oldLife: 0, oldPension: 0, amount: 0 };
    const r = calculate(s, R8);
    expect(item(r, 'incomeTax', 'lifeInsurance').amount).toBe(45_000);
    expect(item(r, 'residentTax', 'lifeInsurance').amount).toBe(28_000);
    // 扶養親族の所得要件（62万円）を超える場合は特例なし
    s.dependents[0].income = 700_000;
    expect(item(calculate(s, R8), 'incomeTax', 'lifeInsurance').amount).toBe(35_000);
  });
  it('税制データに表がない年度は金額を推測せず未登録にする', () => {
    const s = base(2025);
    s.deductions.lifeInsurance = { newLife: 60_000, newCare: 0, newPension: 0, oldLife: 0, oldPension: 0, amount: 0 };
    const r = calculate(s, { ...R7, deductions: { ...R7.deductions, incomeTax: { ...R7.deductions.incomeTax, insurance: undefined } } });
    expect(item(r, 'incomeTax', 'lifeInsurance').amount).toBeNull();
    expect(r.missing).toContain('deductions.incomeTax.insurance');
  });
  it('保険料の入力がなければ0円（既存の保存データとの互換）', () => {
    const r = calculate(base(2025), R7);
    expect(item(r, 'incomeTax', 'lifeInsurance').amount).toBe(0);
  });
});

describe('ふるさと納税の寄附上限額の目安', () => {
  const salary = (taxYear, man, actualSI, patch = {}) => {
    const s = defaultState();
    s.taxYear = taxYear;
    s.residence.prefecture = '広島県';
    s.incomes = [{ ...newIncome('salary'), amount: man * 10_000 }];
    s.insurance = { type: 'employee', actualAnnual: actualSI };
    return calculate(Object.assign(s, patch), getTaxYear(taxYear));
  };
  it('手計算: 令和7年分・給与500万円・社保70万円', () => {
    // 住民税所得割=243,000-調整控除2,500=240,500 / 所得税の課税所得2,180,000円→限界税率10%
    // 上限=240,500×20%÷(1-0.1-0.1×1.021)=48,100÷0.7979=60,283.2…→60,283 +2,000 = 62,283
    const r = salary(2025, 500, 700_000);
    expect(r.furusato).toMatchObject({ levyBase: 240_500, marginalRate: 0.1, limit: 62_283 });
  });
  it('税率区分が変わると上限が段差的に変わる（限界税率5%の場合）: 令和8年分・給与500万円・社保75万円', () => {
    // 所得税の課税所得=3,560,000-基礎1,040,000-社保750,000=1,770,000円→5% / 住民税: 課税2,380,000→238,000-2,500=235,500
    // 上限=235,500×20%÷(1-0.1-0.05×1.021)=47,100÷0.84895=55,480.6…→55,480 +2,000 = 57,480
    const r = salary(2026, 500, 750_000);
    expect(r.furusato).toMatchObject({ levyBase: 235_500, marginalRate: 0.05, limit: 57_480 });
  });
  it('住民税が非課税なら上限は0円', () => {
    const r = salary(2025, 100, 0);
    expect(r.residentTax.exemption).toBe('all');
    expect(r.furusato.limit).toBe(0);
  });
  it('民間サイト（さとふる・税理士監修）の早見表との照合: 独身・給与収入300〜1,000万円（社保は給与の15%・令和8年分）', () => {
    // 早見表（実質負担2,000円の控除上限額。独身）。税率区分の変わる700万円付近の段差も再現できること。誤差は±1.5%以内
    const table = { 300: 28_000, 350: 35_000, 400: 42_000, 450: 50_000, 500: 58_000, 550: 69_000, 600: 77_000, 650: 86_000, 700: 108_000, 750: 119_000, 800: 130_000, 850: 141_000, 900: 153_000, 950: 165_000, 1000: 177_000 };
    for (const [man, expected] of Object.entries(table)) {
      const limit = salary(2026, Number(man), Math.floor(Number(man) * 10_000 * 0.15)).furusato.limit;
      expect(Math.abs(limit - expected) / expected, `給与${man}万円: ${limit} vs ${expected}`).toBeLessThan(0.015);
    }
  });
  it('出典は二次情報と明記している', () => {
    expect(R7.sources.find((x) => x.id === 'SECONDARY_FURUSATO').secondary).toBe(true);
    expect(R7.furusato).toMatchObject({ specialLimitRate: 0.2, selfBurden: 2_000 });
  });
});
