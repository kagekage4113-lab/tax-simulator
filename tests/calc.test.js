// 期待値はすべて手計算（コメントに計算過程）。実装コードから生成していない。
import { describe, expect, it } from 'vitest';
import { calculate } from '../src/calc/engine.js';
import { applyRounding } from '../src/calc/rounding.js';
import { calcProgressive, lookupStep } from '../src/calc/progressive.js';
import { defaultState, newIncome } from '../src/core/schema.js';
import { getTaxYear } from '../src/data/taxYears/index.js';
import { syntheticRules as R } from './fixtures/syntheticRules.js';

const inc = (category, amount, expenses = 0, extra = {}) => ({ ...newIncome(category), amount, expenses, ...extra });
const mk = (incomes, patch = {}) => {
  const s = defaultState();
  s.incomes = incomes;
  s.insurance = { type: 'none', actualAnnual: null };
  return Object.assign(s, patch);
};
const run = (s) => calculate(s, R);
const item = (r, kind, id) => r.deductions[kind].items.find((i) => i.id === id);

describe('端数処理・累進計算（境界）', () => {
  it('applyRounding', () => {
    expect(applyRounding(1999, { rule: 'floor', unit: 1000 })).toBe(1000);
    expect(applyRounding(1001, { rule: 'ceil', unit: 1000 })).toBe(2000);
    expect(applyRounding(1500, { rule: 'round', unit: 1000 })).toBe(2000);
    expect(applyRounding(1499, { rule: 'round', unit: 1000 })).toBe(1000);
    expect(applyRounding(1000, { rule: 'floor', unit: 1000 })).toBe(1000);
  });
  it('税率区分の境界前後で連続する（速算表）', () => {
    const b = R.incomeTax.brackets;
    expect(calcProgressive(1_000_000, b)).toBe(100_000);
    expect(calcProgressive(1_000_001, b)).toBe(100_000); // floor(200000.2)-100000
    expect(calcProgressive(3_000_000, b)).toBe(500_000);
    expect(calcProgressive(3_000_001, b)).toBe(500_000); // floor(900000.3)-400000
    expect(calcProgressive(3_000_010, b)).toBe(500_003); // 900003-400000
  });
  it('課税所得0以下は0', () => {
    expect(calcProgressive(0, R.incomeTax.brackets)).toBe(0);
    expect(calcProgressive(-5, R.incomeTax.brackets)).toBe(0);
  });
  it('段階表の境界', () => {
    expect(lookupStep(24_000_000, R.basicDeduction.incomeTax)).toBe(480_000);
    expect(lookupStep(24_000_001, R.basicDeduction.incomeTax)).toBe(0);
  });
});

describe('給与のみ（概算の社保）', () => {
  // 給与500万: 給与所得控除=0.1*5,000,000+500,000=1,000,000 → 給与所得4,000,000
  // 社保(概算)=0.15*5,000,000=750,000。所得税の控除=基礎480,000+社保750,000=1,230,000 → 課税2,770,000
  // 税=2,770,000*0.2-100,000=454,000, 復興=floor(454,000*0.02)=9,080, 合計463,080→463,000
  // 住民税: 控除=430,000+750,000=1,180,000 → 課税2,820,000 → 282,000+均等割5,000=287,000
  const s = mk([inc('salary', 5_000_000)], { insurance: { type: 'employee', actualAnnual: null } });
  const r = run(s);
  it('所得', () => { expect(r.income.salaryDeduction).toBe(1_000_000); expect(r.income.comprehensive).toBe(4_000_000); });
  it('所得税', () => {
    expect(r.taxable.incomeTax.comprehensive).toBe(2_770_000);
    expect(r.incomeTax.comprehensiveTax).toBe(454_000);
    expect(r.incomeTax.reconstruction).toBe(9_080);
    expect(r.incomeTax.total).toBe(463_000);
  });
  it('住民税', () => { expect(r.residentTax.total).toBe(287_000); });
  it('負担合計と手取り', () => {
    expect(r.socialInsurance).toEqual({ total: 750_000, mode: 'estimate' });
    expect(r.burden).toBe(1_500_000);
    expect(r.takeHome).toBe(3_500_000);
  });
  it('社会保険料の実額を入力すると概算より優先される', () => {
    const r2 = run({ ...s, insurance: { type: 'employee', actualAnnual: 600_000 } });
    expect(r2.socialInsurance).toEqual({ total: 600_000, mode: 'actual' });
    expect(item(r2, 'incomeTax', 'socialInsurance').mode).toBe('actual');
    // 課税所得 = 4,000,000-480,000-600,000=2,920,000 → 584,000-100,000=484,000, 復興9,680 → 493,680→493,600
    expect(r2.incomeTax.total).toBe(493_600);
  });
});

describe('収入ゼロ・課税所得ゼロ以下', () => {
  it('収入なしでも負の税額にならない', () => {
    const r = run(mk([]));
    expect(r.income.total).toBe(0);
    expect(r.incomeTax.total).toBe(0);
  });
  it('控除が所得を上回ると課税所得0、税額0', () => {
    const r = run(mk([inc('salary', 1_000_000)])); // 給与所得=600,000 < 基礎480,000? 600,000-480,000=120,000
    expect(r.taxable.incomeTax.comprehensive).toBe(120_000);
    const r2 = run(mk([inc('salary', 800_000)])); // 控除400,000 → 所得400,000 < 基礎480,000
    expect(r2.taxable.incomeTax.comprehensive).toBe(0);
    expect(r2.incomeTax.total).toBe(0);
  });
});

describe('課税所得の端数（1000円未満切捨）', () => {
  it('給与3,251,234', () => {
    // 控除=floor(325,123.4)+500,000=825,123 → 所得2,426,111 → 基礎480,000(社保0) → 1,946,111 → 1,946,000
    // 税=1,946,000*0.2-100,000=289,200, 復興5,784 → 294,984→294,900
    const r = run(mk([inc('salary', 3_251_234)]));
    expect(r.taxable.incomeTax.comprehensive).toBe(1_946_000);
    expect(r.incomeTax.total).toBe(294_900);
  });
});

describe('事業所得・青色申告特別控除・個人事業税', () => {
  it('青色65万: 売上300万-経費50万=250万、控除65万 → 所得185万', () => {
    const r = run(mk([inc('business', 3_000_000, 500_000)], { filing: { type: 'blue', blueDeduction: 65 } }));
    expect(r.income.blueDeductionApplied).toBe(650_000);
    expect(r.income.businessIncome).toBe(1_850_000);
    // 課税=1,850,000-480,000=1,370,000 → 274,000-100,000=174,000, 復興3,480 → 177,480→177,400
    expect(r.incomeTax.total).toBe(177_400);
  });
  it.each([
    [10, 100_000, 500_000],
    [55, 550_000, 50_000],
    [65, 600_000, 0], // 所得600,000が上限
  ])('青色%i万控除の適用額（事業所得600,000）', (n, applied, income) => {
    const r = run(mk([inc('business', 600_000)], { filing: { type: 'blue', blueDeduction: n } }));
    expect(r.income.blueDeductionApplied).toBe(applied);
    expect(r.income.businessIncome).toBe(income);
  });
  it('白色は特別控除なし', () => {
    expect(run(mk([inc('business', 600_000)])).income.blueDeductionApplied).toBe(0);
  });
  it('事業所得800万・対象業種: 事業税=(800万-300万)*5%=250,000、手取り反映', () => {
    const r = run(mk([inc('business', 10_000_000, 2_000_000, { businessType: 'type1' })]));
    // 所得税: 課税7,520,000 → 2,256,000-400,000=1,856,000, 復興37,120 → 1,893,120→1,893,100
    // 住民税: 課税7,570,000 → 757,000+5,000=762,000
    expect(r.businessTax.total).toBe(250_000);
    expect(r.incomeTax.total).toBe(1_893_100);
    expect(r.residentTax.total).toBe(762_000);
    expect(r.takeHome).toBe(10_000_000 - 2_000_000 - 1_893_100 - 762_000 - 250_000); // 5,094,900
  });
  it('対象外業種・事業主控除以下は0円', () => {
    expect(run(mk([inc('business', 10_000_000, 2_000_000)])).businessTax.total).toBe(0);
    expect(run(mk([inc('business', 3_000_000, 0, { businessType: 'type1' })])).businessTax.total).toBe(0);
  });
});

describe('損益通算', () => {
  const salary3m = inc('salary', 3_000_000); // 控除=0.2*3,000,000+200,000=800,000 → 所得2,200,000
  it('雑所得の赤字は通算しない', () => {
    const r = run(mk([salary3m, inc('misc', 100_000, 600_000)]));
    expect(r.income.miscLossIgnored).toBe(500_000);
    expect(r.income.comprehensive).toBe(2_200_000);
  });
  it('事業所得の赤字は給与と通算する', () => {
    const r = run(mk([salary3m, inc('business', 100_000, 600_000)]));
    expect(r.income.comprehensive).toBe(1_700_000);
  });
  it('不動産所得の赤字は通算する（注意表示）', () => {
    const r = run(mk([salary3m, inc('realEstate', 100_000, 600_000)]));
    expect(r.income.comprehensive).toBe(1_700_000);
    expect(r.notes.join()).toMatch(/不動産所得の赤字/);
  });
  it('赤字が他の所得を上回っても総所得は0未満にならない', () => {
    const r = run(mk([inc('business', 0, 500_000)]));
    expect(r.income.comprehensive).toBe(0);
    expect(r.income.lossOffset).toBe(500_000);
    expect(r.incomeTax.total).toBe(0);
  });
  it('不動産所得の収入−経費', () => {
    expect(run(mk([inc('realEstate', 1_200_000, 400_000)])).income.comprehensive).toBe(800_000);
  });
  it('給与と副業(雑所得)の同時存在', () => {
    expect(run(mk([salary3m, inc('misc', 500_000, 100_000)])).income.comprehensive).toBe(2_600_000);
  });
});

describe('FX・先物（申告分離）', () => {
  it('繰越損失を差し引き、所得控除の余りがFXから引かれる', () => {
    // 利益1,000,000-繰越300,000=700,000。総合0なので基礎480,000が全てFXへ → 所得税課税220,000
    // 税=floor(220,000*0.15)=33,000, 復興660 → 33,660→33,600 ／ 住民税: 課税270,000*0.05=13,500+均等割5,000=18,500
    const r = run(mk([inc('fx', 1_000_000)], { fxCarryForward: 300_000 }));
    expect(r.income.fx).toMatchObject({ income: 700_000, carryUsed: 300_000, carryRemaining: 0 });
    expect(r.taxable.incomeTax).toMatchObject({ comprehensive: 0, fx: 220_000, spillToFx: 480_000 });
    expect(r.incomeTax.total).toBe(33_600);
    expect(r.residentTax.total).toBe(18_500);
    expect(r.takeHome).toBe(1_000_000 - 33_600 - 18_500);
  });
  it('総合課税の累進税率に合算されず、固定税率で別計算', () => {
    const s = mk([inc('salary', 5_000_000), inc('fx', 1_000_000)], { insurance: { type: 'employee', actualAnnual: null } });
    const r = run(s);
    expect(r.incomeTax.comprehensiveTax).toBe(454_000); // FXなしと同じ
    expect(r.incomeTax.fxTax).toBe(150_000);
    expect(r.incomeTax.total).toBe(616_000); // (604,000+12,080)=616,080→616,000
  });
  it('FXの損失は給与と通算されず、繰越額に積まれる', () => {
    const s = mk([inc('salary', 5_000_000), inc('fx', -200_000)], { insurance: { type: 'employee', actualAnnual: null } });
    const r = run(s);
    expect(r.income.comprehensive).toBe(4_000_000);
    expect(r.income.fx.carryRemaining).toBe(200_000);
    expect(r.incomeTax.fxTax).toBe(0);
    expect(r.incomeTax.total).toBe(463_000);
  });
  it('既存の繰越と当年損失の合算', () => {
    const r = run(mk([inc('fx', -50_000)], { fxCarryForward: 100_000 }));
    expect(r.income.fx.carryRemaining).toBe(150_000);
  });
  it('繰越額が利益より大きい場合は利益分だけ使う', () => {
    const r = run(mk([inc('fx', 100_000)], { fxCarryForward: 250_000 }));
    expect(r.income.fx).toMatchObject({ income: 0, carryUsed: 100_000, carryRemaining: 150_000 });
  });
});

describe('控除（手入力・医療費・税額控除）', () => {
  it('手入力の控除が所得控除に反映される', () => {
    const s = mk([inc('salary', 3_000_000)]);
    s.deductions.smallBusinessMutualAid.amount = 240_000;
    const r = run(s);
    expect(item(r, 'incomeTax', 'smallBusinessMutualAid')).toMatchObject({ amount: 240_000, mode: 'manual' });
    expect(r.deductions.incomeTax.total).toBe(480_000 + 240_000);
    expect(r.deductions.residentTax.total).toBe(430_000 + 240_000);
  });
  it('医療費控除: 合計所得2,200,000→足切り100,000(5%=110,000より小)', () => {
    const s = mk([inc('salary', 3_000_000)]);
    s.deductions.medical = { paid: 300_000, reimbursed: 50_000 };
    expect(item(run(s), 'incomeTax', 'medical').amount).toBe(150_000);
  });
  it('医療費控除: 合計所得1,000,000(控除後)→足切り=5%の50,000', () => {
    const s = mk([inc('business', 1_000_000)]);
    s.deductions.medical = { paid: 300_000, reimbursed: 50_000 };
    expect(item(run(s), 'incomeTax', 'medical').amount).toBe(200_000);
  });
  it('税額控除が税額を負にしない', () => {
    const s = mk([inc('salary', 3_000_000)]);
    s.taxCredits.housingLoan.amount = 10_000_000;
    s.taxCredits.donationCredit.amount = 10_000_000;
    const r = run(s);
    expect(r.incomeTax.total).toBe(0);
    expect(r.residentTax.total).toBe(5_000); // 所得割0＋均等割のみ
  });
  it('税額控除が所得税から差し引かれる', () => {
    // 給与300万→所得220万, 社保0, 控除480,000 → 課税1,720,000 → 344,000-100,000=244,000
    // 住宅ローン控除44,000 → 200,000, 復興4,000 → 204,000
    const s = mk([inc('salary', 3_000_000)]);
    s.taxCredits.housingLoan.amount = 44_000;
    expect(run(s).incomeTax.total).toBe(204_000);
  });
  it('人的控除の金額データが無い年度では、金額を推測せず未確定(null)にする', () => {
    const s = mk([inc('salary', 3_000_000)]);
    s.spouse.exists = true;
    const r = run(s); // syntheticRules には deductions.incomeTax が無い
    expect(item(r, 'incomeTax', 'spouse').amount).toBeNull();
    expect(r.missing).toContain('deductions.incomeTax');
    expect(r.incomeTax).toBeNull();
  });
});

describe('簡易扱い（未対応区分）', () => {
  it('総合課税の直接入力所得は所得に加算される', () => {
    const r = run(mk([inc('other', 500_000, 0, { taxMethod: 'comprehensive' })]));
    expect(r.income.comprehensive).toBe(500_000);
  });
  it('分離課税の直接入力所得は税額に含めず注意を出す', () => {
    const r = run(mk([inc('securities', 500_000)]));
    expect(r.income.comprehensive).toBe(0);
    expect(r.notes.join()).toMatch(/分離課税/);
  });
});

describe('税制データ未登録（実データの骨組み）', () => {
  it('推測せず、未登録項目を列挙して計算結果をnullにする（令和7年分は骨組みのみ）', () => {
    const s = mk([inc('salary', 5_000_000)]);
    const r = calculate(s, getTaxYear(2025));
    expect(r.incomeTax).toBeNull();
    expect(r.residentTax).toBeNull();
    expect(r.takeHome).toBeNull();
    expect(r.missing).toContain('salaryDeduction.brackets');
    expect(r.missing).toContain('incomeTax.brackets');
    expect(r.income.revenueTotal).toBe(5_000_000); // 税制データに依存しない値は出る
  });
});

// ---------------------------------------------------------------------------
// 令和8年分の実データ（docs/tax-sources の国税庁「年末調整のしかた」p.3-4, p.55-56 の表）に対するテスト。
// 期待値は資料の表から直接取ったもの。実装コードから生成していない。
// ---------------------------------------------------------------------------
import { autoIncomeTaxDeductions } from '../src/calc/autoDeductions.js';

const R8 = getTaxYear(2026);
const D8 = R8.deductions.incomeTax;
const person = (o = {}) => ({ id: 'x', name: '', relationship: 'child', age: 30, cohabiting: true, income: 0, disability: 'none', ...o });
const auto = (state, totalIncome = 3_000_000) => {
  const missing = [];
  const items = autoIncomeTaxDeductions(state, D8, totalIncome, (k) => { missing.push(k); });
  return { items, missing, get: (id) => items.find((i) => i.id === id) };
};
const run8 = (s) => calculate(s, R8);

describe('令和8年分: 所得税の速算表（年末調整用 p.55）', () => {
  const b = R8.incomeTax.brackets;
  it.each([
    [1_950_000, 97_500], [1_950_001, 97_500],
    [3_300_000, 232_500], [3_300_001, 232_500],
    [6_950_000, 962_500], [6_950_001, 962_500],
    [9_000_000, 1_434_000], [9_000_001, 1_434_000],
    [18_000_000, 4_404_000], [18_000_001, 4_404_000],
  ])('課税所得%i円 → %i円（区分の境界で連続）', (t, tax) => expect(calcProgressive(t, b)).toBe(tax));
  it('資料にある範囲(18,050,000円)を超えると推測せず null', () => {
    expect(calcProgressive(18_050_000, b)).toBe(4_424_000); // 18,050,000*0.4=7,220,000 → 7,220,000-2,796,000
    expect(calcProgressive(18_050_001, b)).toBeNull();
  });
});

describe('令和8年分: 基礎控除（p.56）', () => {
  it.each([
    [0, 1_040_000], [4_890_000, 1_040_000], [4_890_001, 670_000],
    [6_550_000, 670_000], [6_550_001, 620_000], [23_500_000, 620_000],
    [23_500_001, 480_000], [24_000_000, 480_000], [24_000_001, 320_000],
    [24_500_000, 320_000], [24_500_001, 160_000], [25_000_000, 160_000], [25_000_001, 0],
  ])('合計所得金額%i円 → %i円', (income, amount) => expect(lookupStep(income, R8.basicDeduction.incomeTax)).toBe(amount));
});

describe('令和8年分: 給与所得（収入220万円以下のみ資料あり）', () => {
  const sal = (n) => run8({ ...mk([inc('salary', n)]) }).income;
  it('74万円以下は給与所得0、74万超は収入−74万（p.3）', () => {
    expect(sal(700_000).salaryIncome).toBe(0);
    expect(sal(741_000).salaryIncome).toBe(1_000);
    expect(sal(1_000_000).salaryIncome).toBe(260_000);
    expect(sal(2_191_000).salaryIncome).toBe(1_451_000); // p.3 ハの表
    expect(sal(2_193_000).salaryIncome).toBe(1_453_000);
    expect(sal(2_196_000).salaryIncome).toBe(1_456_000);
    expect(sal(2_200_000).salaryIncome).toBe(1_460_000);
  });
  it('220万円超は資料が無いため未登録として扱う', () => {
    const r = run8(mk([inc('salary', 2_200_001)]));
    expect(r.income.salaryIncome).toBeNull();
    expect(r.missing).toContain('salaryDeduction.brackets@>2200000');
    expect(r.incomeTax).toBeNull();
  });
});

describe('令和8年分: 配偶者控除・配偶者特別控除（p.55）', () => {
  const sp = (o) => ({ ...mk([]), spouse: { exists: true, age: 40, income: 0, disability: 'none', cohabiting: true, ...o } });
  it.each([
    // [所得者の合計所得, 配偶者の合計所得, 配偶者年齢, 期待]
    [9_000_000, 620_000, 40, 380_000], [9_000_001, 620_000, 40, 260_000], [9_500_000, 620_000, 40, 260_000],
    [9_500_001, 620_000, 40, 130_000], [10_000_000, 620_000, 40, 130_000], [10_000_001, 620_000, 40, 0],
    [9_000_000, 620_000, 70, 480_000], [9_500_000, 620_000, 70, 320_000], [10_000_000, 620_000, 70, 160_000],
    [3_000_000, 620_001, 40, 380_000], [3_000_000, 950_000, 40, 380_000], [3_000_000, 950_001, 40, 360_000],
    [3_000_000, 1_000_000, 40, 360_000], [3_000_000, 1_000_001, 40, 310_000], [3_000_000, 1_050_000, 40, 310_000],
    [3_000_000, 1_100_000, 40, 260_000], [3_000_000, 1_150_000, 40, 210_000], [3_000_000, 1_200_000, 40, 160_000],
    [3_000_000, 1_250_000, 40, 110_000], [3_000_000, 1_300_000, 40, 60_000], [3_000_000, 1_330_000, 40, 30_000],
    [3_000_000, 1_330_001, 40, 0],
    [9_000_001, 1_330_000, 40, 20_000], [9_500_001, 1_330_000, 40, 10_000], [9_500_001, 1_000_000, 40, 120_000],
    [9_000_001, 1_150_000, 40, 140_000], [9_500_001, 1_150_000, 40, 70_000],
  ])('所得者%i円・配偶者所得%i円・配偶者%i歳 → %i円', (owner, spouseIncome, age, expected) => {
    expect(auto(sp({ income: spouseIncome, age }), owner).get('spouse').amount).toBe(expected);
  });
  it('配偶者がいなければ項目なし', () => { expect(auto(mk([]), 3_000_000).get('spouse')).toBeUndefined(); });
});

describe('令和8年分: 扶養控除（p.56）', () => {
  const dep = (o) => ({ ...mk([]), dependents: [person(o)] });
  it.each([
    [15, 0, 'child', true, 0], [16, 0, 'child', true, 380_000], [18, 0, 'child', true, 380_000],
    [19, 0, 'child', true, 630_000], [22, 0, 'child', true, 630_000], [23, 0, 'child', true, 380_000],
    [69, 0, 'parent', true, 380_000], [70, 0, 'parent', true, 580_000], [70, 0, 'parent', false, 480_000],
    [70, 0, 'sibling', true, 480_000], [75, 0, 'grandparent', true, 580_000],
    [30, 620_000, 'child', true, 380_000], [30, 620_001, 'child', true, 0],
  ])('年齢%i・所得%i・%s・同居%s → %i円', (age, income, rel, coh, expected) => {
    expect(auto(dep({ age, income, relationship: rel, cohabiting: coh })).get('dependent').amount).toBe(expected);
  });
  it('複数人は合算', () => {
    const s = { ...mk([]), dependents: [person({ age: 20 }), person({ age: 17 }), person({ age: 72, relationship: 'parent' })] };
    expect(auto(s).get('dependent').amount).toBe(630_000 + 380_000 + 580_000);
  });
});

describe('令和8年分: 特定親族特別控除（p.56）', () => {
  it.each([
    [620_001, 630_000], [850_000, 630_000], [850_001, 610_000], [900_000, 610_000], [900_001, 510_000], [950_000, 510_000],
    [950_001, 410_000], [1_000_000, 410_000], [1_000_001, 310_000], [1_050_000, 310_000], [1_050_001, 210_000],
    [1_100_000, 210_000], [1_100_001, 110_000], [1_150_000, 110_000], [1_150_001, 60_000], [1_200_000, 60_000],
    [1_200_001, 30_000], [1_230_000, 30_000],
  ])('特定親族の合計所得%i円 → %i円', (income, amount) => expect(lookupStep(income, D8.specificRelative.steps)).toBe(amount));
  it('年齢要件の資料が無いため、対象になりうる所得の親族がいると確定させない', () => {
    const s = { ...mk([]), dependents: [person({ age: 20, income: 700_000 })] };
    const a = auto(s);
    expect(a.get('specificRelative').amount).toBeNull();
    expect(a.missing).toContain('deductions.incomeTax.specificRelative.ageMin');
    expect(a.get('dependent').amount).toBe(0); // 所得62万円超なので扶養控除の対象外
  });
  it('所得が範囲外なら対象外（未確認扱いにもしない）', () => {
    const a = auto({ ...mk([]), dependents: [person({ age: 20, income: 1_230_001 })] });
    expect(a.get('specificRelative')).toBeUndefined();
  });
});

describe('令和8年分: 障害者・寡婦・ひとり親・勤労学生（p.56）', () => {
  it('本人の障害者控除', () => {
    expect(auto({ ...mk([]), self: { ...defaultState().self, disability: 'general' } }).get('disability').amount).toBe(270_000);
    expect(auto({ ...mk([]), self: { ...defaultState().self, disability: 'special' } }).get('disability').amount).toBe(400_000);
  });
  it('配偶者・扶養親族の障害者控除（同居特別障害者は75万円）', () => {
    const s = { ...mk([]), spouse: { exists: true, age: 40, income: 0, disability: 'special', cohabiting: true },
      dependents: [person({ disability: 'special', cohabiting: false }), person({ disability: 'general' })] };
    expect(auto(s).get('disability').amount).toBe(750_000 + 400_000 + 270_000);
  });
  it('扶養控除と障害者控除は両方適用される', () => {
    const a = auto({ ...mk([]), dependents: [person({ age: 40, disability: 'special' })] });
    expect(a.get('dependent').amount).toBe(380_000);
    expect(a.get('disability').amount).toBe(750_000);
  });
  it('所得要件を超える配偶者・扶養親族の障害者控除は対象外', () => {
    const s = { ...mk([]), spouse: { exists: true, age: 40, income: 620_001, disability: 'special', cohabiting: true }, dependents: [person({ income: 620_001, disability: 'general' })] };
    expect(auto(s).get('disability').amount).toBe(0);
  });
  it('寡婦270,000円・ひとり親350,000円', () => {
    expect(auto({ ...mk([]), self: { ...defaultState().self, widowSingleParent: 'widow' } }).get('widowSingleParent').amount).toBe(270_000);
    expect(auto({ ...mk([]), self: { ...defaultState().self, widowSingleParent: 'singleParent' } }).get('widowSingleParent').amount).toBe(350_000);
  });
  it('勤労学生: 合計所得89万円以下で270,000円（境界）', () => {
    const s = { ...mk([]), self: { ...defaultState().self, workingStudent: true } };
    expect(auto(s, 890_000).get('workingStudent').amount).toBe(270_000);
    expect(auto(s, 890_001).get('workingStudent').amount).toBe(0);
  });
});

describe('令和8年分: 統合（手計算）', () => {
  it('給与200万・社保実額15万: 所得税は基準所得税額まで出し、復興税が未登録のため合計は出さない', () => {
    // 給与所得=2,000,000-740,000=1,260,000 / 控除=基礎1,040,000+社保150,000=1,190,000 / 課税=70,000 / 税=70,000*5%=3,500
    const s = mk([inc('salary', 2_000_000)], { insurance: { type: 'employee', actualAnnual: 150_000 } });
    const r = run8(s);
    expect(r.income.salaryIncome).toBe(1_260_000);
    expect(r.deductions.incomeTax.total).toBe(1_190_000);
    expect(r.taxable.incomeTax.comprehensive).toBe(70_000);
    expect(r.incomeTax.base).toBe(3_500);
    expect(r.incomeTax.total).toBeNull();
    expect(r.missing).toContain('incomeTax.reconstructionRate');
    expect(r.takeHome).toBeNull();
  });
  it('住民税は所得控除額が未登録のため確定させない', () => {
    const r = run8(mk([inc('salary', 2_000_000)], { insurance: { type: 'none', actualAnnual: null } }));
    expect(r.residentTax).toBeNull();
    expect(r.missing).toContain('basicDeduction.residentTax');
  });
  it('配偶者控除が課税所得に反映される: 事業所得300万・配偶者所得0・配偶者控除380,000', () => {
    // 所得3,000,000(白色) / 控除=基礎1,040,000+配偶者380,000=1,420,000 / 課税=1,580,000 / 税=79,000
    const s = mk([inc('business', 3_000_000)]);
    s.spouse = { exists: true, age: 40, income: 0, disability: 'none', cohabiting: true };
    const r = run8(s);
    expect(r.deductions.incomeTax.total).toBe(1_420_000);
    expect(r.incomeTax.base).toBe(79_000);
  });
});

describe('令和8年分: 個人事業税（広島県）', () => {
  const bt = (incomes, patch) => run8(mk(incomes, patch)).businessTax;
  it('第1種5%: (800万−290万)×5%=255,000', () => {
    const t = bt([inc('business', 8_000_000, 0, { businessType: 'type1' })]);
    expect(t.total).toBe(255_000);
  });
  it('第2種4%・第3種5%・第3種(あん摩等)3%', () => {
    expect(bt([inc('business', 8_000_000, 0, { businessType: 'type2' })]).total).toBe(204_000);
    expect(bt([inc('business', 8_000_000, 0, { businessType: 'type3' })]).total).toBe(255_000);
    expect(bt([inc('business', 8_000_000, 0, { businessType: 'type3b' })]).total).toBe(153_000);
  });
  it('事業主控除290万円以下は0円（境界）', () => {
    expect(bt([inc('business', 2_900_000, 0, { businessType: 'type1' })]).total).toBe(0);
    expect(bt([inc('business', 2_900_100, 0, { businessType: 'type1' })]).total).toBe(5); // 100円*5%
  });
  it('青色申告特別控除は個人事業税に適用されない', () => {
    const t = bt([inc('business', 8_000_000, 0, { businessType: 'type1' })], { filing: { type: 'blue', blueDeduction: 65 } });
    expect(t.total).toBe(255_000);
  });
  it('複数業種は事業主控除を所得割合で按分: 400万(5%)+400万(3%) → (510万/2)×5% + (510万/2)×3%=204,000', () => {
    expect(bt([inc('business', 4_000_000, 0, { businessType: 'type1' }), inc('business', 4_000_000, 0, { businessType: 'type3b' })]).total).toBe(204_000);
  });
  it('端数処理の根拠が未登録であることを注記する', () => {
    const r = run8(mk([inc('business', 8_000_000, 0, { businessType: 'type1' })]));
    expect(r.notes.join()).toMatch(/端数処理の根拠が未登録/);
  });
});

describe('令和8年分: 住民税の率（福山市）', () => {
  it('所得割10%（市6%+県4%）・均等割+森林環境税=5,500円', () => {
    expect(R8.residentTax.incomeRate).toBe(0.1);
    expect(R8.residentTax.perCapita).toBe(5_500);
  });
});
