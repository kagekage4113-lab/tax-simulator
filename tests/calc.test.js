// 期待値はすべて手計算（コメントに計算過程）。実装コードから生成していない。
import { describe, expect, it } from 'vitest';
import { calcAdjustmentCredit, calculate } from '../src/calc/engine.js';
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
    const r = run(mk([inc('fx', 1_000_000)], { fxCarryLosses: [{ year: 2024, amount: 300_000 }] }));
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
    const r = run(mk([inc('fx', -50_000)], { fxCarryLosses: [{ year: 2024, amount: 100_000 }] }));
    expect(r.income.fx.carryRemaining).toBe(150_000);
  });
  it('繰越額が利益より大きい場合は利益分だけ使う', () => {
    const r = run(mk([inc('fx', 100_000)], { fxCarryLosses: [{ year: 2024, amount: 250_000 }] }));
    expect(r.income.fx).toMatchObject({ income: 0, carryUsed: 100_000, carryRemaining: 150_000 });
  });
});

describe('FXの繰越損失（年ごと・3年・古い年から: No.1523）', () => {
  // 令和7年（2025）分。損失の年の翌年以後3年間 = 2022年の損失は2023〜2025年分に使える。2021年の損失は使えない。
  const carry = (profit, losses) => run(mk([inc('fx', profit)], { taxYear: 2025, fxCarryLosses: losses }));
  it('3年以内の損失は使え、3年を過ぎた損失は使えない（境界）', () => {
    expect(carry(1_000_000, [{ year: 2022, amount: 200_000 }]).income.fx).toMatchObject({ carryUsed: 200_000, income: 800_000 });
    const old = carry(1_000_000, [{ year: 2021, amount: 200_000 }]);
    expect(old.income.fx).toMatchObject({ carryUsed: 0, income: 1_000_000 });
    expect(old.income.fx.carryExpired).toEqual([{ year: 2021, amount: 200_000 }]);
    expect(old.notes.join()).toMatch(/3年を過ぎている/);
  });
  it('古い年の損失から先に控除する。使い切れない分は翌年に繰り越すが、2022年分は今年で期限切れ', () => {
    // 利益300,000: 2022年の損失200,000を全額、2023年の損失250,000のうち100,000を使い、残り150,000は翌年へ
    const r = carry(300_000, [{ year: 2023, amount: 250_000 }, { year: 2022, amount: 200_000 }]);
    expect(r.income.fx).toMatchObject({ carryIn: 450_000, carryUsed: 300_000, income: 0 });
    expect(r.income.fx.carryNext).toEqual([{ year: 2023, amount: 150_000 }]);
    expect(r.income.fx.carryRemaining).toBe(150_000);
  });
  it('利益が足りず2022年分が使い切れない場合は、期限切れの額を明示（翌年に繰り越せない）', () => {
    const r = carry(50_000, [{ year: 2022, amount: 200_000 }, { year: 2024, amount: 100_000 }]);
    expect(r.income.fx).toMatchObject({ carryUsed: 50_000, income: 0, expiringAmount: 150_000 });
    expect(r.income.fx.carryNext).toEqual([{ year: 2024, amount: 100_000 }]);
    expect(r.notes.join()).toMatch(/150,000円は、今年で3年の期限/);
  });
  it('当年の損失は翌年への繰越に加わる', () => {
    const r = carry(-80_000, [{ year: 2023, amount: 100_000 }]);
    expect(r.income.fx.carryNext).toEqual([{ year: 2023, amount: 100_000 }, { year: 2025, amount: 80_000 }]);
    expect(r.income.fx.carryRemaining).toBe(180_000);
  });
  it('今年以降の年の損失は無視して注記する', () => {
    const r = carry(100_000, [{ year: 2025, amount: 50_000 }]);
    expect(r.income.fx.carryUsed).toBe(0);
    expect(r.notes.join()).toMatch(/2025年に生じた損失は2025年分には繰り越せない/);
  });
  it('繰越控除の手続き要件を注記する', () => {
    expect(carry(100_000, [{ year: 2024, amount: 10_000 }]).notes.join()).toMatch(/付表付きで確定申告/);
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

describe('税制データ未登録（空のルール）', () => {
  it('推測せず、未登録項目を列挙して計算結果をnullにする', () => {
    const s = mk([inc('salary', 5_000_000)]);
    const r = calculate(s, { year: 1 });
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
import { autoIncomeTaxDeductions, autoPersonalDeductions } from '../src/calc/autoDeductions.js';

const R8 = getTaxYear(2026);
const D8 = R8.deductions.incomeTax;
const person = (o = {}) => ({ id: 'x', name: '', relationship: 'child', age: 30, cohabiting: true, income: 0, disability: 'none', ...o });
const auto = (state, totalIncome = 3_000_000) => {
  const missing = [];
  const items = autoIncomeTaxDeductions(state, D8, totalIncome, (k) => { missing.push(k); });
  return { items, missing, get: (id) => items.find((i) => i.id === id) };
};
const run8 = (s) => calculate(s, R8);

describe('令和8年分: 所得税の速算表（No.2260・年末調整用 p.55）', () => {
  const b = R8.incomeTax.brackets;
  it.each([
    [1_950_000, 97_500], [1_950_001, 97_500],
    [3_300_000, 232_500], [3_300_001, 232_500],
    [6_950_000, 962_500], [6_950_001, 962_500],
    [9_000_000, 1_434_000], [9_000_001, 1_434_000],
    [18_000_000, 4_404_000], [18_000_001, 4_404_000],
  ])('課税所得%i円 → %i円（区分の境界で連続）', (t, tax) => expect(calcProgressive(t, b)).toBe(tax));
  it('18,050,000円超・4,000万円以上の区分（No.2260）', () => {
    expect(calcProgressive(18_050_000, b)).toBe(4_424_000); // 18,050,000*0.4=7,220,000 → 7,220,000-2,796,000
    expect(calcProgressive(18_050_001, b)).toBe(4_424_000);
    expect(calcProgressive(40_000_000, b)).toBe(13_204_000); // 16,000,000-2,796,000
    expect(calcProgressive(40_000_001, b)).toBe(13_204_000); // 18,000,000.45→18,000,000-4,796,000
    expect(calcProgressive(50_000_000, b)).toBe(17_704_000); // 22,500,000-4,796,000
  });
  it('No.2260 の具体例: 課税所得7,000,000円 → 974,000円、復興特別所得税は(974,000×2.1%)', () => {
    expect(calcProgressive(7_000_000, b)).toBe(974_000);
  });
  it('資料の範囲を超える表（途中までの表）は推測せず null を返す', () => {
    expect(calcProgressive(1_000_001, [{ upTo: 1_000_000, rate: 0.1, deduction: 0 }])).toBeNull();
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
  it('2,191,000〜2,199,999円は固定額（No.1410 注2）', () => {
    expect(sal(2_192_000).salaryIncome).toBe(1_451_000);
    expect(sal(2_195_999).salaryIncome).toBe(1_453_000);
    expect(sal(2_199_999).salaryIncome).toBe(1_456_000);
    expect(sal(691_000).salaryIncome).toBe(0);
    expect(sal(740_999).salaryIncome).toBe(0);
  });
  // 令和8・9年分（No.1410）: 3,600,000円まで30%+80,000 / 6,600,000円まで20%+440,000 / 8,500,000円まで10%+1,100,000 / 以上1,950,000
  it.each([
    [2_200_001, 1_460_001], [3_600_000, 2_440_000], [3_600_001, 2_440_001],
    [6_600_000, 4_840_000], [6_600_001, 4_840_001], [7_000_000, 5_200_000], // 660万以上850万未満は 収入×90%−110万（No.1410 速算表）
    [8_500_000, 6_550_000], [8_500_001, 6_550_001], [10_000_000, 8_050_000],
  ])('給与収入%i円 → 給与所得%i円', (rev, income) => expect(sal(rev).salaryIncome).toBe(income));
  it('660万円未満は別表との差が出うる旨を注記する', () => {
    expect(run8(mk([inc('salary', 3_000_000)])).notes.join()).toMatch(/別表/);
    expect(run8(mk([inc('salary', 2_000_000)])).notes.join()).not.toMatch(/別表/); // 220万円以下は資料の表で確定
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
  it('特定親族(19〜22歳・所得62万円超123万円以下)に特定親族特別控除が適用される', () => {
    const a = auto({ ...mk([]), dependents: [person({ age: 20, income: 700_000 })] });
    expect(a.get('specificRelative').amount).toBe(630_000);
    expect(a.get('dependent').amount).toBe(0); // 所得62万円超なので扶養控除の対象外
    expect(auto({ ...mk([]), dependents: [person({ age: 22, income: 1_230_000 })] }).get('specificRelative').amount).toBe(30_000);
  });
  it('年齢が19〜22歳以外、または所得が範囲外なら対象外', () => {
    expect(auto({ ...mk([]), dependents: [person({ age: 18, income: 700_000 })] }).get('specificRelative').amount).toBe(0);
    expect(auto({ ...mk([]), dependents: [person({ age: 23, income: 700_000 })] }).get('specificRelative').amount).toBe(0);
    expect(auto({ ...mk([]), dependents: [person({ age: 20, income: 1_230_001 })] }).get('specificRelative')).toBeUndefined();
  });
  it('年齢要件の資料が無い年度データでは、確定させず未登録扱い', () => {
    const d = { ...D8, specificRelative: { ...D8.specificRelative, ageMin: null, ageMax: null } };
    const missing = [];
    const items = autoIncomeTaxDeductions({ ...mk([]), dependents: [person({ age: 20, income: 700_000 })] }, d, 3_000_000, (k) => missing.push(k));
    expect(items.find((i) => i.id === 'specificRelative').amount).toBeNull();
    expect(missing).toContain('deductions.incomeTax.specificRelative.ageMin');
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
  it('給与200万・社保実額15万（住民税は令和8年度の控除額で代用）', () => {
    // 給与所得=2,000,000-740,000=1,260,000 / 所得税の控除=基礎1,040,000+社保150,000=1,190,000 / 課税=70,000 / 税=70,000*5%=3,500
    // 復興特別所得税(2.1%)=floor(73.5)=73 → 3,573（税額の端数処理は資料なしのため未実施）
    // 住民税: 控除=基礎430,000+社保150,000=580,000 → 課税680,000 → 所得割68,000
    //   調整控除=min(①基礎の差額50,000, ②680,000)×5%=2,500 → 65,500 + 均等割等5,500 = 71,000
    // 負担=3,573+71,000+150,000=224,573 / 手取り=2,000,000-224,573=1,775,427
    const s = mk([inc('salary', 2_000_000)], { insurance: { type: 'employee', actualAnnual: 150_000 } });
    const r = run8(s);
    expect(r.income.salaryIncome).toBe(1_260_000);
    expect(r.deductions.incomeTax.total).toBe(1_190_000);
    expect(r.taxable.incomeTax.comprehensive).toBe(70_000);
    expect(r.incomeTax.base).toBe(3_500);
    expect(r.incomeTax.reconstruction).toBe(73);
    expect(r.incomeTax.total).toBe(3_573);
    expect(r.residentTax.adjustment).toBe(2_500);
    expect(r.residentTax.total).toBe(71_000);
    expect(r.takeHome).toBe(1_775_427);
    expect(r.notes.join()).toMatch(/令和9年度.*代用/); // 住民税の控除額が代用であることを明示
    expect(r.notes.join()).not.toMatch(/二次情報/); // 復興特別所得税は国税庁No.1521/2260で確認済み
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

// ---------------------------------------------------------------------------
// 令和7年分（国税庁 年末調整のしかた R7 p.55-56 / No.1410）と、福山市の住民税（令和8年度分）
// ---------------------------------------------------------------------------
const R7 = getTaxYear(2025);
const D7 = R7.deductions.incomeTax;
const DR = R7.deductions.residentTax;
const autoWith = (d, key, state, totalIncome = 3_000_000) => {
  const items = autoPersonalDeductions(state, d, totalIncome, () => {}, key);
  return { get: (id) => items.find((i) => i.id === id) };
};
const spouseOf = (o) => ({ ...mk([]), spouse: { exists: true, age: 40, income: 0, disability: 'none', cohabiting: true, ...o } });

describe('令和7年分: 基礎控除（R7 p.56）', () => {
  it.each([
    [1_320_000, 950_000], [1_320_001, 880_000], [3_360_000, 880_000], [3_360_001, 680_000], [4_890_000, 680_000],
    [4_890_001, 630_000], [6_550_000, 630_000], [6_550_001, 580_000], [23_500_000, 580_000], [23_500_001, 480_000],
    [24_000_001, 320_000], [24_500_001, 160_000], [25_000_000, 160_000], [25_000_001, 0],
  ])('合計所得金額%i円 → %i円', (income, amount) => expect(lookupStep(income, R7.basicDeduction.incomeTax)).toBe(amount));
});

describe('令和7年分: 給与所得控除（No.1410）', () => {
  const sal = (n) => calculate(mk([inc('salary', n)]), R7).income;
  it.each([
    [1_900_000, 1_250_000], [1_900_001, 1_250_001], [3_600_000, 2_440_000], [3_600_001, 2_440_001],
    [6_600_000, 4_840_000], [6_600_001, 4_840_001], [8_500_000, 6_550_000], [8_500_001, 6_550_001],
  ])('給与収入%i円 → 給与所得%i円', (rev, income) => expect(sal(rev).salaryIncome).toBe(income));
  it('令和8年分の特例（220万円未満の固定額）は令和7年分には適用しない', () => {
    // 令和7年分: 2,192,000円 → 控除=2,192,000×30%+80,000=737,600 → 給与所得1,454,400（令和8年分の固定額1,451,000にはならない）
    expect(sal(2_192_000).salaryIncome).toBe(1_454_400);
  });
});

describe('令和7年分: 配偶者・扶養などの所得要件（58万円基準）', () => {
  it('配偶者控除は配偶者の合計所得58万円以下（境界）', () => {
    expect(autoWith(D7, 'incomeTax', spouseOf({ income: 580_000 }), 9_000_000).get('spouse').amount).toBe(380_000);
    expect(autoWith(D7, 'incomeTax', spouseOf({ income: 580_001 }), 9_000_001).get('spouse').amount).toBe(260_000); // 配偶者特別控除(58万超95万以下)
  });
  it('扶養親族の所得要件58万円', () => {
    const dep = (income) => ({ ...mk([]), dependents: [person({ age: 40, income })] });
    expect(autoWith(D7, 'incomeTax', dep(580_000)).get('dependent').amount).toBe(380_000);
    expect(autoWith(D7, 'incomeTax', dep(580_001)).get('dependent').amount).toBe(0);
  });
  it('配偶者の障害者控除は同一生計配偶者(58万円以下)のみ', () => {
    expect(autoWith(D7, 'incomeTax', spouseOf({ income: 580_000, disability: 'special', cohabiting: true })).get('disability').amount).toBe(750_000);
    expect(autoWith(D7, 'incomeTax', spouseOf({ income: 600_000, disability: 'special' })).get('disability').amount).toBe(0);
  });
  it('特定親族特別控除は58万円超から', () => {
    expect(autoWith(D7, 'incomeTax', { ...mk([]), dependents: [person({ age: 20, income: 580_001 })] }).get('specificRelative').amount).toBe(630_000);
    expect(autoWith(D7, 'incomeTax', { ...mk([]), dependents: [person({ age: 20, income: 580_000 })] }).get('specificRelative')).toBeUndefined();
  });
  it('勤労学生控除は合計所得85万円以下', () => {
    const s = { ...mk([]), self: { ...defaultState().self, workingStudent: true } };
    expect(autoWith(D7, 'incomeTax', s, 850_000).get('workingStudent').amount).toBe(270_000);
    expect(autoWith(D7, 'incomeTax', s, 850_001).get('workingStudent').amount).toBe(0);
  });
  it('ひとり親控除は合計所得500万円以下（境界）', () => {
    const s = { ...mk([]), self: { ...defaultState().self, widowSingleParent: 'singleParent' } };
    expect(autoWith(D7, 'incomeTax', s, 5_000_000).get('widowSingleParent').amount).toBe(350_000);
    expect(autoWith(D7, 'incomeTax', s, 5_000_001).get('widowSingleParent').amount).toBe(0);
  });
});

describe('住民税（福山市・令和8年度分）の控除', () => {
  it.each([
    [0, 430_000], [24_000_000, 430_000], [24_000_001, 290_000], [24_500_000, 290_000],
    [24_500_001, 150_000], [25_000_000, 150_000], [25_000_001, 0],
  ])('基礎控除 合計所得%i円 → %i円', (income, amount) => expect(lookupStep(income, R7.basicDeduction.residentTax)).toBe(amount));

  it.each([
    // [所得者の合計所得, 配偶者所得, 配偶者年齢, 期待]
    [9_000_000, 580_000, 40, 330_000], [9_000_001, 580_000, 40, 220_000], [9_500_001, 580_000, 40, 110_000],
    [10_000_000, 580_000, 40, 110_000], [10_000_001, 580_000, 40, 0],
    [9_000_000, 580_000, 70, 380_000], [9_500_000, 580_000, 70, 260_000], [10_000_000, 580_000, 70, 130_000],
    [3_000_000, 580_001, 40, 330_000], [3_000_000, 1_000_000, 40, 330_000], [3_000_000, 1_000_001, 40, 310_000],
    [3_000_000, 1_100_000, 40, 260_000], [3_000_000, 1_150_000, 40, 210_000], [3_000_000, 1_200_000, 40, 160_000],
    [3_000_000, 1_250_000, 40, 110_000], [3_000_000, 1_300_000, 40, 60_000], [3_000_000, 1_330_000, 40, 30_000],
    [3_000_000, 1_330_001, 40, 0],
    [9_500_000, 1_300_000, 40, 40_000], [10_000_000, 1_330_000, 40, 10_000], [9_500_000, 1_150_000, 40, 140_000],
  ])('配偶者 所得者%i円・配偶者所得%i円・%i歳 → %i円', (owner, income, age, expected) => {
    expect(autoWith(DR, 'residentTax', spouseOf({ income, age }), owner).get('spouse').amount).toBe(expected);
  });
  it.each([
    [15, 0, 'child', true, 0], [16, 0, 'child', true, 330_000], [19, 0, 'child', true, 450_000], [22, 0, 'child', true, 450_000],
    [23, 0, 'child', true, 330_000], [70, 0, 'parent', true, 450_000], [70, 0, 'parent', false, 380_000],
    [30, 580_000, 'child', true, 330_000], [30, 580_001, 'child', true, 0],
  ])('扶養 年齢%i・所得%i・%s・同居%s → %i円', (age, income, rel, coh, expected) => {
    const s = { ...mk([]), dependents: [person({ age, income, relationship: rel, cohabiting: coh })] };
    expect(autoWith(DR, 'residentTax', s).get('dependent').amount).toBe(expected);
  });
  it.each([
    [580_001, 450_000], [950_000, 450_000], [950_001, 410_000], [1_000_000, 410_000], [1_000_001, 310_000],
    [1_050_001, 210_000], [1_100_001, 110_000], [1_150_001, 60_000], [1_200_001, 30_000], [1_230_000, 30_000],
  ])('特定親族特別控除 所得%i円 → %i円', (income, amount) => {
    expect(autoWith(DR, 'residentTax', { ...mk([]), dependents: [person({ age: 20, income })] }).get('specificRelative').amount).toBe(amount);
  });
  it('障害者控除: 一般26万・特別30万・同居特別53万（30万+23万）', () => {
    const me = (d) => ({ ...mk([]), self: { ...defaultState().self, disability: d } });
    expect(autoWith(DR, 'residentTax', me('general')).get('disability').amount).toBe(260_000);
    expect(autoWith(DR, 'residentTax', me('special')).get('disability').amount).toBe(300_000);
    expect(autoWith(DR, 'residentTax', { ...mk([]), dependents: [person({ disability: 'special', cohabiting: true })] }).get('disability').amount).toBe(530_000);
  });
  it('寡婦26万・ひとり親30万（合計所得500万円以下）・勤労学生26万（85万円以下）', () => {
    const w = (k) => ({ ...mk([]), self: { ...defaultState().self, widowSingleParent: k } });
    expect(autoWith(DR, 'residentTax', w('widow'), 5_000_000).get('widowSingleParent').amount).toBe(260_000);
    expect(autoWith(DR, 'residentTax', w('singleParent'), 5_000_000).get('widowSingleParent').amount).toBe(300_000);
    expect(autoWith(DR, 'residentTax', w('singleParent'), 5_000_001).get('widowSingleParent').amount).toBe(0);
    const g = { ...mk([]), self: { ...defaultState().self, workingStudent: true } };
    expect(autoWith(DR, 'residentTax', g, 850_000).get('workingStudent').amount).toBe(260_000);
    expect(autoWith(DR, 'residentTax', g, 850_001).get('workingStudent').amount).toBe(0);
  });
  it('医療費控除: 福山市の算式（10万円または総所得金額等の5%の少ない額・限度200万円）', () => {
    expect(R7.medical).toMatchObject({ thresholdFixed: 100_000, thresholdRate: 0.05, cap: 2_000_000 });
  });
});

describe('令和7年分: 統合（手計算）— 所得税・住民税・手取りまで', () => {
  // 給与500万・社保実額70万・扶養なし
  // 給与所得=5,000,000-(5,000,000*20%+440,000=1,440,000)=3,560,000
  // 所得税: 基礎(336万超489万以下)680,000+社保700,000=1,380,000 → 課税2,180,000 → 10%: 218,000-97,500=120,500
  //   復興2.1%: floor(2,530.5)=2,530 → 123,030（税額の端数処理は資料なしのため未実施）
  // 住民税: 基礎430,000+社保700,000=1,130,000 → 課税2,430,000 → 所得割243,000
  //   調整控除: ②=2,430,000>200万 → ①50,000-(430,000)<5万 → 5万 → 50,000×5%=2,500 → 240,500 + 均等割等5,500 = 246,000
  // 負担=123,030+246,000+700,000=1,069,030 / 手取り=5,000,000-1,069,030=3,930,970
  const r = calculate(mk([inc('salary', 5_000_000)], { insurance: { type: 'employee', actualAnnual: 700_000 } }), R7);
  it('所得・課税所得', () => {
    expect(r.income.salaryIncome).toBe(3_560_000);
    expect(r.taxable.incomeTax.comprehensive).toBe(2_180_000);
    expect(r.taxable.residentTax.comprehensive).toBe(2_430_000);
  });
  it('税額と手取り', () => {
    expect(r.incomeTax.base).toBe(120_500);
    expect(r.incomeTax.reconstruction).toBe(2_530);
    expect(r.incomeTax.total).toBe(123_030);
    expect(r.residentTax.adjustment).toBe(2_500);
    expect(r.residentTax.total).toBe(246_000);
    expect(r.burden).toBe(1_069_030);
    expect(r.takeHome).toBe(3_930_970);
    expect(r.missing).toEqual([]);
  });
  it('前提の注記（端数処理・別表・住民税の概算）が出る', () => {
    const n = r.notes.join('\n');
    expect(n).not.toMatch(/二次情報/);
    expect(n).toMatch(/端数処理の根拠が未登録/);
    expect(n).toMatch(/別表/);
    expect(n).toMatch(/福山市/);
  });
  it('配偶者(所得0)がいると所得税・住民税の控除がそれぞれの表で入る', () => {
    const s = mk([inc('salary', 5_000_000)], { insurance: { type: 'employee', actualAnnual: 700_000 } });
    s.spouse = { exists: true, age: 40, income: 0, disability: 'none', cohabiting: true };
    const r2 = calculate(s, R7);
    // 所得者の合計所得3,560,000は900万以下 → 所得税の配偶者控除380,000 / 住民税330,000
    expect(item(r2, 'incomeTax', 'spouse').amount).toBe(380_000);
    expect(item(r2, 'residentTax', 'spouse').amount).toBe(330_000);
    expect(r2.deductions.incomeTax.total).toBe(680_000 + 700_000 + 380_000);
    expect(r2.deductions.residentTax.total).toBe(430_000 + 700_000 + 330_000);
  });
});

// ---------------------------------------------------------------------------
// 協会けんぽ（令和8年3月分〜）による社会保険料の概算。期待値は保険料額表（広島・福岡・大阪）の行から取った。
// ---------------------------------------------------------------------------
describe('社会保険料の概算（協会けんぽ・月ごとの料率）', () => {
  // 令和8年分 = 1〜2月(令和7年度料率) 2か月 + 3月(令和8年度・支援金なし) 1か月 + 4〜12月(令和8年度・支援金あり) 9か月
  // 令和7年分 = 令和7年3月分からの料率で12か月（1〜2月は旧料率が未登録のため代用）
  // 年収480万円=月40万円 → 等級27(24) 標準報酬410,000円 / 厚生年金折半 410,000×18.3%÷2=37,515 / 端数は50銭以下切捨・50銭超切上げ
  const si = (year, salary, patch = {}) => {
    const s = mk([inc('salary', salary)], { insurance: { type: 'employee', actualAnnual: null }, taxYear: year, ...patch });
    return calculate(s, getTaxYear(year));
  };
  const at = (pref, age = 30) => ({ residence: { prefecture: pref, city: '' }, self: { ...defaultState().self, age } });

  describe('令和8年分（2026）', () => {
    const y = (salary, patch) => si(2026, salary, patch);
    it('広島・30歳', () => {
      // 1-2月: 410,000×9.97%÷2=20,438.5 + 37,515 = 57,953.5 → 57,953 ×2 = 115,906
      // 3月:   410,000×9.78%÷2=20,049   + 37,515 = 57,564             ×1 =  57,564
      // 4-12月: 20,049 + 支援金410,000×0.23%÷2=471.5 + 37,515 = 58,035.5 → 58,035 ×9 = 522,315 → 695,785
      expect(y(4_800_000, at('広島県')).socialInsurance).toEqual({ total: 695_785, mode: 'estimate' });
    });
    it('広島・45歳は介護保険料を含む', () => {
      // 1-2月: 410,000×(9.97%+1.59%)÷2=23,698 + 37,515 = 61,213 ×2 = 122,426
      // 3月:   410,000×(9.78%+1.62%)÷2=23,370 + 37,515 = 60,885 ×1 =  60,885
      // 4-12月: 23,370 + 471.5 + 37,515 = 61,356.5 → 61,356 ×9 = 552,204 → 735,515
      const r = y(4_800_000, at('広島県', 45));
      expect(r.socialInsurance.total).toBe(735_515);
      expect(r.notes.join()).toMatch(/介護保険料/);
    });
    it('40歳・64歳は介護あり、39歳・65歳はなし（境界）', () => {
      expect(y(4_800_000, at('広島県', 39)).socialInsurance.total).toBe(695_785);
      expect(y(4_800_000, at('広島県', 40)).socialInsurance.total).toBe(735_515);
      expect(y(4_800_000, at('広島県', 64)).socialInsurance.total).toBe(735_515);
      expect(y(4_800_000, at('広島県', 65)).socialInsurance.total).toBe(695_785);
    });
    it('福岡（令和7年度の資料なし→1〜2月は3支部平均10.04%）', () => {
      // 1-2月: 410,000×10.04%÷2=20,582 + 37,515 = 58,097 ×2 = 116,194
      // 3月:   410,000×10.11%÷2=20,725.5 + 37,515 = 58,240.5 → 58,240 ×1
      // 4-12月: 20,725.5 + 471.5 + 37,515 = 58,712 ×9 = 528,408 → 702,842
      const r = y(4_800_000, at('福岡県'));
      expect(r.socialInsurance.total).toBe(702_842);
      expect(r.notes.join()).toMatch(/平均/);
    });
    it('大阪', () => {
      // 1-2月: 410,000×10.24%÷2=20,992 + 37,515 = 58,507 ×2 = 117,014
      // 3月:   410,000×10.13%÷2=20,766.5 + 37,515 = 58,281.5 → 58,281 ×1
      // 4-12月: 20,766.5 + 471.5 + 37,515 = 58,753 ×9 = 528,777 → 704,072
      expect(y(4_800_000, at('大阪府')).socialInsurance.total).toBe(704_072);
    });
    it('東京（令和8年度の資料なし→3月以降は3府県平均10.0067%）', () => {
      // 1-2月: 410,000×9.91%÷2=20,315.5 + 37,515 = 57,830.5 → 57,830 ×2 = 115,660
      // 3月:   410,000×10.00667%÷2=20,513.67 + 37,515 = 58,028.67 → 58,029 ×1
      // 4-12月: 20,513.67 + 471.5 + 37,515 = 58,500.17 → 58,500 ×9 = 526,500 → 700,189
      const r = y(4_800_000, at('東京都'));
      expect(r.socialInsurance.total).toBe(700_189);
      expect(r.notes.join()).toMatch(/平均/);
    });
    it('等級の境界: 報酬月額394,999円は標準380,000円(等級26)、395,000円は標準410,000円(等級27)', () => {
      // 標準380,000: 厚年折半34,770
      // 1-2月: 380,000×9.97%÷2=18,943 + 34,770 = 53,713 ×2 = 107,426 / 3月: 18,582 + 34,770 = 53,352
      // 4-12月: 18,582 + 437 + 34,770 = 53,789 ×9 = 484,101 → 644,879
      expect(y(394_999 * 12, at('広島県')).socialInsurance.total).toBe(644_879);
      expect(y(395_000 * 12, at('広島県')).socialInsurance.total).toBe(695_785);
    });
    it('厚生年金は標準報酬650,000円で頭打ち（月額100万円は健保等級43・標準980,000円）', () => {
      // 厚年折半=650,000×18.3%÷2=59,475
      // 1-2月: 980,000×9.97%÷2=48,853 + 59,475 = 108,328 ×2 = 216,656 / 3月: 47,922 + 59,475 = 107,397
      // 4-12月: 47,922 + 1,127 + 59,475 = 108,524 ×9 = 976,716 → 1,300,769
      expect(y(12_000_000, at('広島県')).socialInsurance.total).toBe(1_300_769);
    });
    it('低報酬: 報酬月額63,000円未満は標準58,000円、厚生年金は88,000円（折半8,052）から', () => {
      // 1-2月: 58,000×9.97%÷2=2,891.3 + 8,052 = 10,943.3 → 10,943 ×2 = 21,886 / 3月: 2,836.2 + 8,052 = 10,888.2 → 10,888
      // 4-12月: 2,836.2 + 66.7 + 8,052 = 10,954.9 → 10,955 ×9 = 98,595 → 131,369
      expect(y(600_000, at('広島県')).socialInsurance.total).toBe(131_369);
    });
  });

  describe('令和7年分（2025）: 令和7年3月分からの料率（広島9.97%・東京9.91%・大阪10.24%・介護1.59%）', () => {
    const y = (salary, patch) => si(2025, salary, patch);
    it('広島・30歳: 410,000×9.97%÷2=20,438.5 + 37,515 = 57,953.5 → 57,953 ×12 = 695,436', () => {
      expect(y(4_800_000, at('広島県')).socialInsurance.total).toBe(695_436);
    });
    it('広島・45歳: 410,000×11.56%÷2=23,698 + 37,515 = 61,213 ×12 = 734,556', () => {
      expect(y(4_800_000, at('広島県', 45)).socialInsurance.total).toBe(734_556);
    });
    it('東京: 20,315.5 + 37,515 = 57,830.5 → 57,830 ×12 = 693,960', () => {
      expect(y(4_800_000, at('東京都')).socialInsurance.total).toBe(693_960);
    });
    it('大阪: 20,992 + 37,515 = 58,507 ×12 = 702,084', () => {
      expect(y(4_800_000, at('大阪府')).socialInsurance.total).toBe(702_084);
    });
    it('福岡（令和7年度の資料なし→3支部平均10.04%）: 20,582 + 37,515 = 58,097 ×12 = 697,164', () => {
      const r = y(4_800_000, at('福岡県'));
      expect(r.socialInsurance.total).toBe(697_164);
      expect(r.notes.join()).toMatch(/平均/);
    });
  });

  it('実額を入力すれば概算より優先', () => {
    expect(si(2026, 4_800_000, { ...at('広島県'), insurance: { type: 'employee', actualAnnual: 500_000 } }).socialInsurance).toEqual({ total: 500_000, mode: 'actual' });
  });
  it('個人事業主は国保税と国民年金で概算できる（二次情報の注意書き付き）', () => {
    const r = calculate(mk([inc('business', 5_000_000)], { insurance: { type: 'national', actualAnnual: null } }), R8);
    expect(r.socialInsurance.total).toBeGreaterThan(215_040); // 国民年金（月17,920円×12）＋国保税
    expect(r.notes.join()).toMatch(/二次情報/);
  });
  it('会社員でも給与がなければ0円', () => {
    expect(si(2026, 0).socialInsurance.total).toBe(0);
  });
});

describe('住民税の調整控除（福山市の算式と差額一覧表）', () => {
  const adjCfg = R7.residentTax.adjustment;
  const adj = (state, totalIncome, taxable) => calcAdjustmentCredit(state, adjCfg, { items: [{ id: 'basic', amount: totalIncome > 25_000_000 ? 0 : 430_000 }] }, totalIncome, taxable);
  const base = mk([]);
  const withSelf = (o) => ({ ...base, self: { ...defaultState().self, ...o } });
  const withSpouse = (o) => ({ ...base, spouse: { exists: true, age: 40, income: 0, disability: 'none', cohabiting: true, ...o } });
  const withDeps = (...ds) => ({ ...base, dependents: ds });

  it('算式: ②が200万円以下は min(①,②)×5%、超は max(①−(②−200万),5万)×5%、2,500万円超は適用なし', () => {
    // ① = 基礎50,000 + 配偶者(一般・所得者300万)50,000 + 扶養(一般・17歳)50,000 = 150,000
    const s = { ...withSpouse({}), dependents: [person({ age: 17 })] };
    expect(adj(s, 3_000_000, 1_500_000)).toBe(7_500);
    expect(adj(s, 3_000_000, 100_000)).toBe(5_000); // min(150,000, 100,000)×5%
    expect(adj(s, 3_000_000, 2_000_000)).toBe(7_500);
    expect(adj(s, 3_000_000, 2_000_001)).toBe(7_499); // (150,000-1)×5%=7,499.95
    expect(adj(s, 3_000_000, 2_100_000)).toBe(2_500); // 150,000-100,000=50,000
    expect(adj(s, 3_000_000, 2_300_000)).toBe(2_500); // 負なら5万円
    expect(adj(s, 3_000_000, 25_000_000)).toBe(2_500);
    expect(adj(s, 3_000_000, 25_000_001)).toBe(0);
  });
  // 以下は ②=200万円（①がそのまま使われる）で ①×5% を検証。基礎控除の差額5万円は含まれる。
  it.each([
    [withSpouse({}), 3_000_000, 100_000], // 一般: 5万
    [withSpouse({}), 9_000_000, 100_000], [withSpouse({}), 9_000_001, 90_000], [withSpouse({}), 9_500_000, 90_000],
    [withSpouse({}), 9_500_001, 70_000], [withSpouse({}), 10_000_000, 70_000],
    [withSpouse({ age: 70 }), 3_000_000, 150_000], // 老人: 10万 / 6万 / 3万
    [withSpouse({ age: 70 }), 9_000_001, 110_000], [withSpouse({ age: 70 }), 9_500_001, 80_000],
    [withSpouse({}), 10_000_001, 50_000], // 所得者1,000万円超は配偶者控除なし
    [withSpouse({ income: 700_000 }), 3_000_000, 50_000], // 配偶者特別控除は差額なし（令和8年度から）
    [withDeps(person({ age: 17 })), 3_000_000, 100_000], // 一般 5万
    [withDeps(person({ age: 20 })), 3_000_000, 230_000], // 特定 18万
    [withDeps(person({ age: 72 })), 3_000_000, 150_000], // 老人 10万
    [withDeps(person({ age: 72, relationship: 'parent', cohabiting: true })), 3_000_000, 180_000], // 同居老親等 13万
    [withDeps(person({ age: 15 })), 3_000_000, 50_000], // 16歳未満は控除対象外
    [withDeps(person({ age: 20, income: 700_000 })), 3_000_000, 50_000], // 特定親族特別控除は差額なし
    [withSelf({ disability: 'general' }), 3_000_000, 60_000], // 障害者 一般1万
    [withSelf({ disability: 'special' }), 3_000_000, 150_000], // 特別10万
    [withDeps(person({ age: 40, disability: 'special', cohabiting: true })), 3_000_000, 50_000 + 50_000 + 220_000], // 扶養一般5万＋同居特別22万
    [withSelf({ widowSingleParent: 'widow' }), 3_000_000, 60_000], // 寡婦1万
    [withSelf({ widowSingleParent: 'singleParent' }), 3_000_000, 60_000], // ひとり親（男性の1万円で計算）
    [withSelf({ workingStudent: true }), 800_000, 60_000], // 勤労学生1万
    [base, 25_000_001, 0], // 基礎控除がなければ差額もなし
  ])('人的控除の差額の合計①=%#', (state, owner, expectedDiff) => {
    expect(adj(state, owner, 2_000_000)).toBe(Math.floor(expectedDiff * 0.05 + 1e-6));
  });
});

describe('FX・先物（令和7年分 実データ: 所得税15%＋復興2.1%、住民税5%）', () => {
  const fx = (profit, carry = 0) => calculate(mk([inc('fx', profit)], { fxCarryLosses: carry ? [{ year: 2024, amount: carry }] : [] }), R7);
  it('利益100万円のみ: 手計算', () => {
    // 合計所得=1,000,000 / 所得税: 基礎(132万以下)950,000 → FX課税=50,000 → 15%=7,500 / 復興floor(157.5)=157 → 7,657
    // 住民税: 基礎430,000 → FX課税570,000 → 5%=28,500 + 均等割等5,500 = 34,000 / 手取り=1,000,000-7,657-34,000=958,343
    const r = fx(1_000_000);
    expect(r.taxable.incomeTax).toMatchObject({ comprehensive: 0, fx: 50_000, spillToFx: 950_000 });
    expect(r.incomeTax.fxTax).toBe(7_500);
    expect(r.incomeTax.total).toBe(7_657);
    expect(r.residentTax.total).toBe(34_000);
    expect(r.takeHome).toBe(958_343);
  });
  it('繰越損失30万円を控除し、使い切れない所得控除は余りとして表示', () => {
    // FX所得=700,000 → 基礎控除950,000の方が大きく課税0 / 住民税: 700,000-430,000=270,000 → 13,500+5,500=19,000
    const r = fx(1_000_000, 300_000);
    expect(r.income.fx).toMatchObject({ income: 700_000, carryUsed: 300_000, carryRemaining: 0 });
    expect(r.taxable.incomeTax).toMatchObject({ fx: 0, unusedDeduction: 250_000 });
    expect(r.incomeTax.total).toBe(0);
    expect(r.residentTax.total).toBe(19_000);
  });
  it('損失は他の所得と通算せず繰り越す', () => {
    const r = calculate(mk([inc('salary', 5_000_000), inc('fx', -200_000)], { insurance: { type: 'employee', actualAnnual: 700_000 } }), R7);
    expect(r.income.comprehensive).toBe(3_560_000);
    expect(r.income.fx.carryRemaining).toBe(200_000);
    expect(r.incomeTax.total).toBe(123_030); // FXなしと同じ
  });
});

describe('暗号資産（雑所得・総合課税）', () => {
  it('雑所得の赤字は他の所得と通算しない（暗号資産の赤字も同様）', () => {
    const r = run(mk([inc('salary', 3_000_000), inc('crypto', 0, 500_000)]));
    expect(r.income.miscLossIgnored).toBe(500_000);
    expect(r.income.comprehensive).toBe(2_200_000);
  });
  it('雑所得の内部では暗号資産の損と他の雑所得が通算される', () => {
    // 雑所得 +200,000(副業) と 暗号資産 -50,000 → 150,000
    const r = run(mk([inc('misc', 200_000), inc('crypto', 0, 50_000)]));
    expect(r.income.miscIncome).toBe(150_000);
    expect(r.income.comprehensive).toBe(150_000);
  });
  it('暗号資産の利益は総合課税で給与と合算される', () => {
    const r = run(mk([inc('salary', 3_000_000), inc('crypto', 400_000, 100_000)]));
    expect(r.income.comprehensive).toBe(2_200_000 + 300_000);
  });
});

// ---------------------------------------------------------------------------
// 住民税の非課税判定（福山市 FUKUYAMA_RATE）。令和7年分（令和8年度分）の実データ
// ---------------------------------------------------------------------------
describe('住民税の非課税判定（福山市）', () => {
  // 本人のみ: 合計所得 ≦ 35万+10万=45万 で均等割・所得割とも非課税（扶養なしなら+21万・+32万はない）
  const rt = (incomes, patch) => calculate(mk(incomes, { insurance: { type: 'none', actualAnnual: null }, ...patch }), R7).residentTax;
  it('本人のみ: 合計所得450,000円まで非課税、450,001円から課税', () => {
    // 給与所得=収入-650,000（令和7年分 190万以下）。給与1,100,000 → 450,000 / 1,100,001 → 450,001
    expect(rt([inc('salary', 1_100_000)])).toMatchObject({ exemption: 'all', total: 0 });
    const t = rt([inc('salary', 1_100_001)]);
    expect(t.exemption).toBeNull();
    expect(t.perCapita).toBe(5_500);
  });
  it('配偶者・扶養がいる場合は +21万円（均等割・所得割とも非課税）／+32万円（所得割のみ非課税）', () => {
    // 子1人（10歳・所得0）: n=2 → 非課税 ≦ 70万+10万+21万=1,010,000 / 所得割のみ非課税 ≦ 70万+10万+32万=1,120,000
    const kid = { dependents: [person({ age: 10 })] };
    const at = (income) => rt([inc('business', income)], kid);
    expect(at(1_010_000).exemption).toBe('all');
    const levyOnly = at(1_010_001);
    expect(levyOnly).toMatchObject({ exemption: 'levy', incomeLevy: 0, perCapita: 5_500, total: 5_500 });
    expect(at(1_120_000).exemption).toBe('levy');
    expect(at(1_120_001).exemption).toBeNull();
  });
  it('16歳未満の扶養親族も扶養人数に含める／所得が要件(58万円)を超える親族は含めない', () => {
    expect(rt([inc('business', 1_010_000)], { dependents: [person({ age: 5 })] }).exemption).toBe('all');
    expect(rt([inc('business', 1_010_000)], { dependents: [person({ age: 30, income: 580_001 })] }).exemption).toBeNull();
  });
  it('同一生計配偶者（所得58万円以下）も扶養人数に含める', () => {
    expect(rt([inc('business', 1_010_000)], { spouse: { exists: true, age: 40, income: 580_000, disability: 'none', cohabiting: true } }).exemption).toBe('all');
    expect(rt([inc('business', 1_010_000)], { spouse: { exists: true, age: 40, income: 580_001, disability: 'none', cohabiting: true } }).exemption).toBeNull();
  });
  it('障がい者・未成年者・ひとり親・寡婦は合計所得135万円以下で非課税（境界）', () => {
    const me = (o) => ({ self: { ...defaultState().self, ...o } });
    expect(rt([inc('business', 1_350_000)], me({ disability: 'general' })).exemption).toBe('all');
    expect(rt([inc('business', 1_350_001)], me({ disability: 'general' })).exemption).toBeNull();
    expect(rt([inc('business', 1_350_000)], me({ age: 17 })).exemption).toBe('all');
    expect(rt([inc('business', 1_350_000)], me({ age: 18 })).exemption).toBeNull();
    expect(rt([inc('business', 1_350_000)], me({ widowSingleParent: 'widow' })).exemption).toBe('all');
  });
  it('非課税のときは調整控除・分離課税(FX)の住民税も0円', () => {
    const r = rt([inc('fx', 400_000)]);
    expect(r).toMatchObject({ exemption: 'all', fxTax: 0, adjustment: 0, total: 0 });
  });
});

// ---------------------------------------------------------------------------
// 確定申告の要否（給与所得者）の参考表示: 国税庁 No.1900
// ---------------------------------------------------------------------------
describe('確定申告の要否の参考表示（No.1900）', () => {
  const f = (incomes, patch) => calculate(mk(incomes, patch), R7).filing;
  const salary = () => inc('salary', 5_000_000);
  it('給与1か所＋給与以外の所得が20万円以下なら「不要の可能性」、20万円超なら「必要の可能性」（境界）', () => {
    expect(f([salary(), inc('misc', 200_000)])).toMatchObject({ status: 'likelyNotRequired', sideIncome: 200_000 });
    expect(f([salary(), inc('misc', 200_001)])).toMatchObject({ status: 'required', sideIncome: 200_001 });
  });
  it('給与以外の所得は収入−経費の所得金額で判定する（雑所得 収入50万−経費30万=20万）', () => {
    expect(f([salary(), inc('misc', 500_000, 300_000)]).status).toBe('likelyNotRequired');
    expect(f([salary(), inc('misc', 500_000, 299_999)]).status).toBe('required');
  });
  it('事業・不動産・暗号資産・簡易扱いの所得も合算する', () => {
    expect(f([salary(), inc('business', 100_000), inc('realEstate', 100_000), inc('crypto', 100_000)]).sideIncome).toBe(300_000);
    expect(f([salary(), inc('business', 100_000), inc('realEstate', 100_000), inc('crypto', 100_000)]).status).toBe('required');
  });
  it('FX・先物の利益も含めて判定する', () => {
    expect(f([salary(), inc('fx', 200_000)]).status).toBe('likelyNotRequired');
    expect(f([salary(), inc('fx', 300_000)]).status).toBe('required');
  });
  it('給与の年間収入が2,000万円を超える場合は必要（境界）', () => {
    expect(f([inc('salary', 20_000_000)]).status).toBe('likelyNotRequired');
    expect(f([inc('salary', 20_000_001)]).status).toBe('required');
  });
  it('給与が2か所以上の場合は断定しない（年末調整されなかった給与が不明）', () => {
    const r = f([salary(), inc('salary', 1_000_000), inc('misc', 10_000)]);
    expect(r.status).toBe('unknown');
    expect(r.reason).toMatch(/年末調整されなかった給与/);
  });
  it('給与がなければ表示しない（事業のみなどは断定しない）', () => {
    expect(f([inc('business', 3_000_000)])).toBeNull();
  });
  it('税制データに規定がない年度では表示しない', () => {
    expect(calculate(mk([salary()]), R).filing).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 個人事業主の社会保険料: 福山市の国民健康保険税（令和8年度＝令和7年所得）。国民年金の額は未登録のため、テストでは架空の額を差し込む。
// ---------------------------------------------------------------------------
describe('国民健康保険税の概算（福山市）', () => {
  const withPension = (monthly) => ({
    ...R7,
    socialInsurance: { estimate: { ...R7.socialInsurance.estimate, national: { ...R7.socialInsurance.estimate.national, pension: { monthly, ageMin: 20, ageMax: 59 } } } },
  });
  const kk = (patch, monthly = 0, income = 3_000_000) => calculate(mk([inc('business', income)], { insurance: { type: 'national', actualAnnual: null }, ...patch }), withPension(monthly));
  const me = (age) => ({ self: { ...defaultState().self, age } });
  const spouse = (o) => ({ spouse: { exists: true, age: 43, income: 0, disability: 'none', cohabiting: true, ...o } });

  it('本人45歳・所得300万円（基礎控除43万円→2,570,000円）: 医療・支援・介護・子ども分の合計', () => {
    // 医療 2,570,000×8.99%=231,043 + 均等割29,520 + 平等割19,680 = 280,243 → 280,200
    // 支援 ×3.15%=80,955 + 10,680 + 6,480 = 98,115 → 98,100 / 介護 ×2.79%=71,703 + 9,960 + 4,800 = 86,463 → 86,400
    // 子ども ×0.29%=7,453 + 均等割1,262+18歳以上79=1,341 + 平等割802 = 9,596 → 9,500 → 合計474,200
    const r = kk(me(45));
    expect(r.socialInsurance).toMatchObject({ total: 474_200, mode: 'estimate' });
    expect(r.notes.join()).toMatch(/法定軽減.*適用していません/); // 世帯所得が基準を超えるため
  });
  it('介護分は40〜64歳のみ（39歳・65歳は介護分なし＝387,800円、40歳・64歳は474,200円）', () => {
    expect(kk(me(39)).socialInsurance.total).toBe(387_800);
    expect(kk(me(40)).socialInsurance.total).toBe(474_200);
    expect(kk(me(64)).socialInsurance.total).toBe(474_200);
    expect(kk(me(65)).socialInsurance.total).toBe(387_800);
    expect(kk(me(74)).socialInsurance.total).toBe(387_800);
  });
  it('75歳以上は後期高齢者医療のため国保税なし', () => {
    const r = kk(me(75));
    expect(r.socialInsurance.total).toBe(0);
    expect(r.notes.join()).toMatch(/後期高齢者医療/);
  });
  it('課税限度額: 所得2,000万円なら 医療67万＋支援26万＋介護17万＋子ども3万＝1,130,000円', () => {
    expect(kk(me(45), 0, 20_000_000).socialInsurance.total).toBe(1_130_000);
  });
  it('世帯: 本人45歳(所得300万)・配偶者43歳(所得0)・子10歳 → 565,900円', () => {
    // 医療 231,043 + 3人×29,520=88,560 + 19,680 = 339,283 → 339,200 / 支援 80,955 + 32,040 + 6,480 = 119,475 → 119,400
    // 介護(本人・配偶者の2人) 71,703 + 19,920 + 4,800 = 96,423 → 96,400 / 子ども 7,453 + (本人・配偶者の18歳以上 2×1,341=2,682、10歳は全額軽減) + 802 = 10,937 → 10,900
    const r = kk({ ...me(45), ...spouse({}), dependents: [person({ age: 10 })] });
    expect(r.socialInsurance.total).toBe(565_900);
  });
  it('未就学児（3歳）は均等割が5割軽減: 545,900円', () => {
    // 医療 231,043 + (29,520×2+14,760=73,800) + 19,680 = 324,523 → 324,500 / 支援 80,955 + (21,360+5,340) + 6,480 = 114,135 → 114,100 / 介護 96,400 / 子ども 10,900
    expect(kk({ ...me(45), ...spouse({}), dependents: [person({ age: 3 })] }).socialInsurance.total).toBe(545_900);
  });
  it('配偶者の所得も所得割に入る（基礎控除は各人ごと）: 配偶者所得100万円 → 612,500円', () => {
    // 所得割の基礎: 2,570,000 + (1,000,000-430,000=570,000) = 3,140,000
    // 医療 282,286 + 59,040 + 19,680 = 361,006 → 361,000 / 支援 98,910 + 21,360 + 6,480 = 126,750 → 126,700
    // 介護 87,606 + 19,920 + 4,800 = 112,326 → 112,300 / 子ども 9,106 + 2,682 + 802 = 12,590 → 12,500
    expect(kk({ ...me(45), ...spouse({ income: 1_000_000 }) }).socialInsurance.total).toBe(612_500);
  });
  it('国民年金（架空の月額10,000円）は20〜59歳の本人・配偶者が対象', () => {
    expect(kk(me(45), 10_000).socialInsurance.total).toBe(474_200 + 120_000);
    expect(kk({ ...me(45), ...spouse({}) }, 10_000).socialInsurance.total).toBe(525_700 + 240_000);
    expect(kk({ ...me(45), ...spouse({ age: 60 }) }, 10_000).socialInsurance.total).toBe(525_700 + 120_000); // 60歳以上は第1号の対象外
    expect(kk(me(60), 10_000).socialInsurance.total - kk(me(60), 0).socialInsurance.total).toBe(0);
  });
  it('国民年金の保険料額が未登録のデータでは確定させない', () => {
    const noPension = { ...R7, socialInsurance: { estimate: { national: { ...R7.socialInsurance.estimate.national, pension: null } } } };
    const r = calculate(mk([inc('business', 3_000_000)], { insurance: { type: 'national', actualAnnual: null } }), noPension);
    expect(r.socialInsurance.total).toBeNull();
    expect(r.missing).toContain('socialInsurance.estimate.national.pension');
    expect(r.takeHome).toBeNull();
  });
  it('実額を入力すれば未登録でも手取りまで出る', () => {
    const r = calculate(mk([inc('business', 3_000_000)], { insurance: { type: 'national', actualAnnual: 600_000 } }), R7);
    expect(r.socialInsurance).toEqual({ total: 600_000, mode: 'actual' });
    expect(r.takeHome).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 国民年金（月17,920円・二次情報）と国保税の法定軽減（7・5・2割・二次情報）
// ---------------------------------------------------------------------------
describe('国民年金と国保税の法定軽減（二次情報）', () => {
  const nat = (income, patch = {}) => calculate(mk([inc('business', income)], { insurance: { type: 'national', actualAnnual: null }, self: { ...defaultState().self, age: 45 }, ...patch }), R7);
  const PENSION = 17_920 * 12; // 215,040円

  it('国民年金は月17,920円×12か月（20〜59歳の本人）', () => {
    // 所得300万円: 国保税474,200円（軽減なし）+ 国民年金215,040円
    expect(nat(3_000_000).socialInsurance.total).toBe(474_200 + PENSION);
    // 60歳以上は国民年金の第1号の対象外
    expect(nat(3_000_000, { self: { ...defaultState().self, age: 60 } }).socialInsurance.total).toBe(474_200); // 60歳も介護分(40〜64歳)の対象。国民年金だけ第1号の対象外で0円
  });
  it('7割軽減: 世帯の判定用所得が43万円以下（本人のみ）', () => {
    // 所得割0（所得40万円は基礎控除43万円以下）。均等割・平等割を30%に: 医療(29,520+19,680)×0.3=14,760→14,700 / 支援(10,680+6,480)×0.3=5,148→5,100
    // 介護(9,960+4,800)×0.3=4,428→4,400 / 子ども(1,341+802)×0.3=642.9→600 → 24,800
    const r = nat(400_000);
    expect(r.socialInsurance.total).toBe(24_800 + PENSION);
    expect(r.socialInsurance.kokuho.rate).toBe(0.7);
  });
  it('5割軽減: 43万円超〜74万円（43万円+31万円×1人）以下', () => {
    // 所得70万円: 基礎控除後270,000円 / 医療 24,273+(49,200×0.5=24,600)=48,873→48,800 / 支援 8,505+8,580=17,085→17,000
    // 介護 7,533+7,380=14,913→14,900 / 子ども 783+1,071.5=1,854.5→1,800 → 82,500
    expect(nat(700_000).socialInsurance.total).toBe(82_500 + PENSION);
    expect(nat(740_000).socialInsurance.kokuho.rate).toBe(0.5);
    expect(nat(740_001).socialInsurance.kokuho.rate).toBe(0.2);
  });
  it('2割軽減: 〜100万円（43万円+57万円×1人）以下。境界の1円差で保険税が段差的に増える', () => {
    // 所得100万円: 基礎控除後570,000円 / 医療 51,243+39,360=90,603→90,600 / 支援 17,955+13,728=31,683→31,600 / 介護 15,903+11,808=27,711→27,700 / 子ども 1,653+1,714.4=3,367.4→3,300 → 153,200
    // 所得1,000,001円: 軽減なし / 医療 51,243.09+49,200=100,443→100,400 / 支援 35,100 / 介護 30,600 / 子ども 3,700 → 169,800
    expect(nat(1_000_000).socialInsurance.total).toBe(153_200 + PENSION);
    expect(nat(1_000_000).socialInsurance.kokuho.rate).toBe(0.2);
    expect(nat(1_000_001).socialInsurance.total).toBe(169_800 + PENSION);
    expect(nat(1_000_001).socialInsurance.kokuho.rate).toBeNull();
  });
  it('世帯の所得で判定する: 配偶者の所得も合算し、被保険者数が増えると基準額も増える', () => {
    // 本人45歳(所得50万円)+配偶者43歳(所得30万円)=80万円 / 被保険者2人: 5割=43万+31万×2=105万円 → 5割軽減
    const r = nat(500_000, { spouse: { exists: true, age: 43, income: 300_000, disability: 'none', cohabiting: true } });
    expect(r.socialInsurance.kokuho).toMatchObject({ householdIncome: 800_000, rate: 0.5 });
    // 7割は43万円(+10万円×(給与・年金所得者数−1))。本人が給与収入55万円超なら1人でも加算なし（人数−1=0）
    expect(r.socialInsurance.kokuho.limits[0].limit).toBe(430_000);
    expect(r.socialInsurance.kokuho.limits[1].limit).toBe(430_000 + 310_000 * 2);
  });
  it('未就学児の均等割5割軽減は法定軽減の後の額に適用される', () => {
    // 所得40万円(7割軽減)・本人45歳・3歳の子: 世帯所得40万円 ≦ 43万円。被保険者2人
    // 医療: 所得割0 + 平等割19,680×0.3=5,904 + 本人均等割29,520×0.3=8,856 + 3歳均等割29,520×0.3×0.5=4,428 = 19,188 → 19,100
    // 支援: 6,480×0.3=1,944 + 10,680×0.3=3,204 + 10,680×0.3×0.5=1,602 = 6,750 → 6,700
    // 介護(本人のみ): 4,800×0.3=1,440 + 9,960×0.3=2,988 = 4,428 → 4,400 / 子ども: 平等802×0.3=240.6 + 本人(1,262+79)×0.3=402.3 + 3歳(18歳未満は全額軽減)0 = 642.9 → 600
    const r = nat(400_000, { dependents: [person({ age: 3 })] });
    expect(r.socialInsurance.total).toBe(19_100 + 6_700 + 4_400 + 600 + PENSION);
  });
  it('75歳以上は後期高齢者医療のため被保険者に数えない（基準額・保険税とも）', () => {
    const r = nat(400_000, { self: { ...defaultState().self, age: 76 } });
    expect(r.socialInsurance.total).toBe(0);
  });
  it('二次情報であることを注意書きに出す', () => {
    expect(nat(3_000_000).notes.join()).toMatch(/二次情報/);
  });
});
