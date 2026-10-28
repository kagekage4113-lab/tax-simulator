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
  s.taxYear = 2025; // 計算ロジックの検証は令和7年分の資料（手計算）で行う。画面が対応する年は令和8年分のみ
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
    expect(r.notes.join()).toMatch(/2025年に生じたFX・先物の損失は2025年分には繰り越せない/);
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
    //   調整控除=min(①基礎の差額50,000, ②680,000)×5%=2,500 → 65,500 + 均等割等5,000 = 70,500
    // 負担=3,573+70,500+150,000=224,073 / 手取り=2,000,000-224,073=1,775,927
    const s = mk([inc('salary', 2_000_000)], { insurance: { type: 'employee', actualAnnual: 150_000 } });
    const r = run8(s);
    expect(r.income.salaryIncome).toBe(1_260_000);
    expect(r.deductions.incomeTax.total).toBe(1_190_000);
    expect(r.taxable.incomeTax.comprehensive).toBe(70_000);
    expect(r.incomeTax.base).toBe(3_500);
    expect(r.incomeTax.reconstruction).toBe(73);
    expect(r.incomeTax.total).toBe(3_573);
    expect(r.residentTax.adjustment).toBe(2_500);
    expect(r.residentTax.total).toBe(70_500);
    expect(r.takeHome).toBe(1_775_927);
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

describe('令和8年分: 住民税の率（東京23区）', () => {
  it('所得割10%（特別区民税6%+都民税4%）・均等割+森林環境税=5,000円', () => {
    expect(R8.residentTax.incomeRate).toBe(0.1);
    expect(R8.residentTax.perCapita).toBe(5_000);
  });
});

// ---------------------------------------------------------------------------
// 令和7年分（国税庁 年末調整のしかた R7 p.55-56 / No.1410）と、東京23区の住民税（令和8年度分）
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

describe('住民税（令和8年度分）の控除', () => {
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
  it('医療費控除: 住民税の算式（10万円または総所得金額等の5%の少ない額・限度200万円）', () => {
    expect(R7.medical).toMatchObject({ thresholdFixed: 100_000, thresholdRate: 0.05, cap: 2_000_000 });
  });
});

describe('令和7年分: 統合（手計算）— 所得税・住民税・手取りまで', () => {
  // 給与500万・社保実額70万・扶養なし
  // 給与所得=5,000,000-(5,000,000*20%+440,000=1,440,000)=3,560,000
  // 所得税: 基礎(336万超489万以下)680,000+社保700,000=1,380,000 → 課税2,180,000 → 10%: 218,000-97,500=120,500
  //   復興2.1%: floor(2,530.5)=2,530 → 123,030（税額の端数処理は資料なしのため未実施）
  // 住民税: 基礎430,000+社保700,000=1,130,000 → 課税2,430,000 → 所得割243,000
  //   調整控除: ②=2,430,000>200万 → ①50,000-(430,000)<5万 → 5万 → 50,000×5%=2,500 → 240,500 + 均等割等5,000 = 245,500
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
    expect(r.residentTax.total).toBe(245_500);
    expect(r.burden).toBe(1_068_530);
    expect(r.takeHome).toBe(3_931_470);
    expect(r.missing).toEqual([]);
  });
  it('前提の注記（端数処理・別表・住民税の概算）が出る', () => {
    const n = r.notes.join('\n');
    expect(n).not.toMatch(/二次情報/);
    expect(n).toMatch(/端数処理の根拠が未登録/);
    expect(n).toMatch(/別表/);
    expect(n).toMatch(/東京23区/);
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
    it('福岡（令和7年度の料率は資料にない→1〜2月は令和8年度の10.11%で代用、注記が出る）', () => {
      // 1-2月: 410,000×10.11%÷2=20,725.5 + 37,515 = 58,240.5 → 58,240 ×2 = 116,480
      // 3月:   同じ 58,240 ×1
      // 4-12月: 20,725.5 + 471.5 + 37,515 = 58,712 ×9 = 528,408 → 703,128
      const r = y(4_800_000, at('福岡県'));
      expect(r.socialInsurance.total).toBe(703_128);
      expect(r.notes.join()).toMatch(/令和8年度の料率で代用/);
      expect(r.notes.join()).not.toMatch(/平均/);
    });
    it('北海道（令和8年度10.28%）: 標準報酬410,000 → 4-12月は 410,000×(10.28%+0.23%)÷2 = 21,545.5 + 37,515 = 59,060.5 → 59,060', () => {
      // 1-2月（令和7年度の料率は資料にないため10.28%で代用）: 410,000×10.28%÷2 = 21,074 + 37,515 = 58,589 ×2 = 117,178
      // 3月:   58,589 ×1
      // 4-12月: 410,000×10.51%÷2 = 21,545.5 + 37,515 = 59,060.5 → 59,060 ×9 = 531,540 → 707,307
      expect(y(4_800_000, at('北海道')).socialInsurance.total).toBe(117_178 + 58_589 + 531_540);
    });
    it('青森（令和7年3月分〜と同じ料率9.85%が確定しているため代用の注記は出ない）', () => {
      // 410,000×9.85%÷2 = 20,192.5 + 37,515 = 57,707.5 → 57,707 ×(2+1) = 173,121 / 4-12月: 20,192.5+471.5+37,515 = 58,179 ×9 = 523,611 → 696,732
      const r = y(4_800_000, at('青森県'));
      expect(r.socialInsurance.total).toBe(696_732);
      expect(r.notes.join()).not.toMatch(/協会けんぽの.*料率は資料にないため/);
    });
    it('47都道府県すべてで料率が登録されている（平均を使わない）', () => {
      const rates = getTaxYear(2026).socialInsurance.estimate.employee.schedule[2].healthRateByPrefecture;
      expect(Object.keys(rates)).toHaveLength(47);
      for (const [k, v] of Object.entries(rates)) { expect(v, k).toBeGreaterThan(0.09); expect(v, k).toBeLessThan(0.11); }
    });
    it('大阪', () => {
      // 1-2月: 410,000×10.24%÷2=20,992 + 37,515 = 58,507 ×2 = 117,014
      // 3月:   410,000×10.13%÷2=20,766.5 + 37,515 = 58,281.5 → 58,281 ×1
      // 4-12月: 20,766.5 + 471.5 + 37,515 = 58,753 ×9 = 528,777 → 704,072
      expect(y(4_800_000, at('大阪府')).socialInsurance.total).toBe(704_072);
    });
    it('東京（令和8年度の保険料額表: 健保9.85%・支援金0.23%）', () => {
      // 標準報酬410,000: 厚年折半 410,000×18.3%÷2 = 37,515
      // 1-2月: 410,000×9.91%÷2=20,315.5 + 37,515 = 57,830.5 → 57,830 ×2 = 115,660
      // 3月:   410,000×9.85%÷2=20,192.5 + 37,515 = 57,707.5 → 57,707 ×1
      // 4-12月: 20,192.5 + 471.5 + 37,515 = 58,179 ×9 = 523,611 → 696,978
      const r = y(4_800_000, at('東京都'));
      expect(r.socialInsurance.total).toBe(696_978);
      expect(r.notes.join()).not.toMatch(/平均/);
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
    it('福岡（令和7年度の料率は資料にない→令和8年度の10.11%で代用）: 20,725.5 + 37,515 = 58,240.5 → 58,240 ×12 = 698,880', () => {
      const r = y(4_800_000, at('福岡県'));
      expect(r.socialInsurance.total).toBe(698_880);
      expect(r.notes.join()).toMatch(/令和8年度の料率で代用/);
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

describe('住民税の調整控除（算式と差額一覧表）', () => {
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
    // 住民税: 基礎430,000 → FX課税570,000 → 5%=28,500 + 均等割等5,000 = 33,500 / 手取り=1,000,000-7,657-33,500=958,843
    const r = fx(1_000_000);
    expect(r.taxable.incomeTax).toMatchObject({ comprehensive: 0, fx: 50_000, spillToFx: 950_000 });
    expect(r.incomeTax.fxTax).toBe(7_500);
    expect(r.incomeTax.total).toBe(7_657);
    expect(r.residentTax.total).toBe(33_500);
    expect(r.takeHome).toBe(958_843);
  });
  it('必要経費を入れると、所得は 損益−経費（経費を引く前の損益は収入側に表示）', () => {
    // 損益1,000,000・経費200,000 → FX所得800,000 / 所得税: 基礎950,000の範囲内で0円
    // 住民税: 基礎430,000 → 課税370,000×5%=18,500 + 均等割等5,000 = 23,500 / 手取り=1,000,000-200,000-0-23,500=776,500
    const r = calculate(mk([inc('fx', 1_000_000, 200_000)]), R7);
    expect(r.income.fx).toMatchObject({ gross: 1_000_000, profit: 800_000, income: 800_000 });
    expect(r.incomeTax.total).toBe(0);
    expect(r.residentTax.total).toBe(23_500);
    expect(r.takeHome).toBe(776_500);
  });
  it('経費が損益を上回って赤字になると、翌年以後に繰り越す損失になる', () => {
    const r = calculate(mk([inc('fx', 100_000, 300_000)]), R7);
    expect(r.income.fx).toMatchObject({ profit: -200_000, income: 0, carryRemaining: 200_000 });
  });
  it('繰越損失30万円を控除し、使い切れない所得控除は余りとして表示', () => {
    // FX所得=700,000 → 基礎控除950,000の方が大きく課税0 / 住民税: 700,000-430,000=270,000 → 13,500+5,000=18,500
    const r = fx(1_000_000, 300_000);
    expect(r.income.fx).toMatchObject({ income: 700_000, carryUsed: 300_000, carryRemaining: 0 });
    expect(r.taxable.incomeTax).toMatchObject({ fx: 0, unusedDeduction: 250_000 });
    expect(r.incomeTax.total).toBe(0);
    expect(r.residentTax.total).toBe(18_500);
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
// 住民税の非課税判定（TOKYO23_BOOKLET）。令和7年分（令和8年度分）の実データ
// ---------------------------------------------------------------------------
describe('住民税の非課税判定', () => {
  // 本人のみ: 合計所得 ≦ 35万+10万=45万 で均等割・所得割とも非課税（扶養なしなら+21万・+32万はない）
  const rt = (incomes, patch) => calculate(mk(incomes, { insurance: { type: 'none', actualAnnual: null }, ...patch }), R7).residentTax;
  it('本人のみ: 合計所得450,000円まで非課税、450,001円から課税', () => {
    // 給与所得=収入-650,000（令和7年分 190万以下）。給与1,100,000 → 450,000 / 1,100,001 → 450,001
    expect(rt([inc('salary', 1_100_000)])).toMatchObject({ exemption: 'all', total: 0 });
    const t = rt([inc('salary', 1_100_001)]);
    expect(t.exemption).toBeNull();
    expect(t.perCapita).toBe(5_000);
  });
  it('配偶者・扶養がいる場合は +21万円（均等割・所得割とも非課税）／+32万円（所得割のみ非課税）', () => {
    // 子1人（10歳・所得0）: n=2 → 非課税 ≦ 70万+10万+21万=1,010,000 / 所得割のみ非課税 ≦ 70万+10万+32万=1,120,000
    const kid = { dependents: [person({ age: 10 })] };
    const at = (income) => rt([inc('business', income)], kid);
    expect(at(1_010_000).exemption).toBe('all');
    const levyOnly = at(1_010_001);
    expect(levyOnly).toMatchObject({ exemption: 'levy', incomeLevy: 0, perCapita: 5_000, total: 5_000 });
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
// 個人事業主の社会保険料: 東京23区の国民健康保険料（東京23区。令和7年度の料率）。国民年金の額は未登録のため、テストでは架空の額を差し込む。
// ---------------------------------------------------------------------------
describe('国民健康保険料の概算（東京23区）', () => {
  const withPension = (monthly) => ({
    ...R7,
    socialInsurance: { estimate: { ...R7.socialInsurance.estimate, national: { ...R7.socialInsurance.estimate.national, pension: { monthly, ageMin: 20, ageMax: 59 } } } },
  });
  const kk = (patch, monthly = 0, income = 3_000_000) => calculate(mk([inc('business', income)], { insurance: { type: 'national', actualAnnual: null }, ...patch }), withPension(monthly));
  const me = (age) => ({ self: { ...defaultState().self, age } });
  const spouse = (o) => ({ spouse: { exists: true, age: 43, income: 0, disability: 'none', cohabiting: true, ...o } });

  // 東京23区（令和7年度の特別区の標準的な料率）: 医療 所得割7.71%・均等割47,300円 / 支援金 2.69%・16,800円 / 介護 2.25%・16,600円（40〜64歳）。平等割なし。端数は1円未満切捨て
  it('本人45歳・所得300万円（基礎控除43万円→2,570,000円）: 医療・支援金・介護分の合計', () => {
    // 医療 2,570,000×7.71%=198,147 + 47,300 = 245,447 / 支援金 ×2.69%=69,133 + 16,800 = 85,933 / 介護 ×2.25%=57,825 + 16,600 = 74,425 → 405,805
    const r = kk(me(45));
    expect(r.socialInsurance).toMatchObject({ total: 405_805, mode: 'estimate' });
    expect(r.notes.join()).toMatch(/法定軽減.*適用していません/); // 世帯所得が基準を超えるため
  });
  it('介護分は40〜64歳のみ（39歳・65歳は介護分なし＝331,380円、40歳・64歳は405,805円）', () => {
    expect(kk(me(39)).socialInsurance.total).toBe(331_380);
    expect(kk(me(40)).socialInsurance.total).toBe(405_805);
    expect(kk(me(64)).socialInsurance.total).toBe(405_805);
    expect(kk(me(65)).socialInsurance.total).toBe(331_380);
    expect(kk(me(74)).socialInsurance.total).toBe(331_380);
  });
  it('75歳以上は後期高齢者医療のため国保料なし', () => {
    const r = kk(me(75));
    expect(r.socialInsurance.total).toBe(0);
    expect(r.notes.join()).toMatch(/後期高齢者医療/);
  });
  it('賦課限度額: 所得2,000万円なら 医療66万＋支援金26万＋介護17万＝1,090,000円', () => {
    expect(kk(me(45), 0, 20_000_000).socialInsurance.total).toBe(1_090_000);
  });
  it('世帯: 本人45歳(所得300万)・配偶者43歳(所得0)・子10歳 → 550,605円', () => {
    // 医療 198,147 + 3人×47,300=141,900 = 340,047 / 支援金 69,133 + 3×16,800=50,400 = 119,533 / 介護(本人・配偶者の2人) 57,825 + 2×16,600=33,200 = 91,025
    const r = kk({ ...me(45), ...spouse({}), dependents: [person({ age: 10 })] });
    expect(r.socialInsurance.total).toBe(550_605);
  });
  it('未就学児（3歳）は均等割が5割軽減: 518,555円', () => {
    // 医療 198,147 + 47,300×2 + 47,300×0.5=23,650 = 316,397 / 支援金 69,133 + 33,600 + 8,400 = 111,133 / 介護 91,025
    expect(kk({ ...me(45), ...spouse({}), dependents: [person({ age: 3 })] }).socialInsurance.total).toBe(518_555);
  });
  it('配偶者の所得も所得割に入る（基礎控除は各人ごと）: 配偶者所得100万円 → 558,610円', () => {
    // 所得割の基礎: 2,570,000 + (1,000,000-430,000=570,000) = 3,140,000
    // 医療 3,140,000×7.71%=242,094 + 94,600 = 336,694 / 支援金 ×2.69%=84,466 + 33,600 = 118,066 / 介護 ×2.25%=70,650 + 33,200 = 103,850
    expect(kk({ ...me(45), ...spouse({ income: 1_000_000 }) }).socialInsurance.total).toBe(558_610);
  });
  it('国民年金（架空の月額10,000円）は20〜59歳の本人・配偶者が対象', () => {
    expect(kk(me(45), 10_000).socialInsurance.total).toBe(405_805 + 120_000);
    expect(kk({ ...me(45), ...spouse({}) }, 10_000).socialInsurance.total).toBe(486_505 + 240_000);
    expect(kk({ ...me(45), ...spouse({ age: 60 }) }, 10_000).socialInsurance.total).toBe(486_505 + 120_000); // 60歳以上は第1号の対象外
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
// 国民年金（月17,920円・日本年金機構）と国保料の法定軽減（7・5・2割・二次情報）
// ---------------------------------------------------------------------------
describe('国民年金（日本年金機構）と国保料の法定軽減（二次情報）', () => {
  const nat = (income, patch = {}) => calculate(mk([inc('business', income)], { insurance: { type: 'national', actualAnnual: null }, self: { ...defaultState().self, age: 45 }, ...patch }), R7);
  const PENSION = 17_920 * 12; // 215,040円

  it('国民年金は月17,920円×12か月（20〜59歳の本人）', () => {
    // 所得300万円: 国保料405,805円（軽減なし）+ 国民年金215,040円
    expect(nat(3_000_000).socialInsurance.total).toBe(405_805 + PENSION);
    // 60歳以上は国民年金の第1号の対象外
    expect(nat(3_000_000, { self: { ...defaultState().self, age: 60 } }).socialInsurance.total).toBe(405_805); // 60歳も介護分(40〜64歳)の対象。国民年金だけ第1号の対象外で0円
  });
  it('7割軽減: 世帯の判定用所得が43万円以下（本人のみ）', () => {
    // 所得割0（所得40万円は基礎控除43万円以下）。均等割を30%に: 医療47,300×0.3=14,190 / 支援金16,800×0.3=5,040 / 介護16,600×0.3=4,980 → 24,210
    const r = nat(400_000);
    expect(r.socialInsurance.total).toBe(24_210 + PENSION);
    expect(r.socialInsurance.kokuho.rate).toBe(0.7);
  });
  it('5割軽減: 43万円超〜74万円（43万円+31万円×1人）以下', () => {
    // 所得70万円: 基礎控除後270,000円 / 医療 270,000×7.71%=20,817 + 47,300×0.5=23,650 = 44,467 / 支援金 7,263 + 8,400 = 15,663 / 介護 6,075 + 8,300 = 14,375 → 74,505
    expect(nat(700_000).socialInsurance.total).toBe(74_505 + PENSION);
    expect(nat(740_000).socialInsurance.kokuho.rate).toBe(0.5);
    expect(nat(740_001).socialInsurance.kokuho.rate).toBe(0.2);
  });
  it('2割軽減: 〜100万円（43万円+57万円×1人）以下。境界の1円差で保険料が段差的に増える', () => {
    // 所得100万円: 基礎控除後570,000円 / 医療 570,000×7.71%=43,947 + 47,300×0.8=37,840 = 81,787 / 支援金 15,333 + 13,440 = 28,773 / 介護 12,825 + 13,280 = 26,105 → 136,665
    // 所得1,000,001円: 軽減なし / 医療 570,001×7.71%=43,947.07+47,300 → 91,247 / 支援金 15,333.03+16,800 → 32,133 / 介護 12,825.02+16,600 → 29,425 → 152,805
    expect(nat(1_000_000).socialInsurance.total).toBe(136_665 + PENSION);
    expect(nat(1_000_000).socialInsurance.kokuho.rate).toBe(0.2);
    expect(nat(1_000_001).socialInsurance.total).toBe(152_805 + PENSION);
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
    // 医療: 47,300×0.3=14,190 + 3歳 47,300×0.3×0.5=7,095 = 21,285 / 支援金: 5,040 + 2,520 = 7,560 / 介護(本人のみ): 4,980 → 33,825
    const r = nat(400_000, { dependents: [person({ age: 3 })] });
    expect(r.socialInsurance.total).toBe(33_825 + PENSION);
  });
  it('75歳以上は後期高齢者医療のため被保険者に数えない（基準額・保険税とも）', () => {
    const r = nat(400_000, { self: { ...defaultState().self, age: 76 } });
    expect(r.socialInsurance.total).toBe(0);
  });
  it('二次情報であることを注意書きに出す', () => {
    expect(nat(3_000_000).notes.join()).toMatch(/二次情報/);
  });
});

describe('暗号資産（国税庁FAQ 令和4年12月）', () => {
  const c = (revenue) => calculate(mk([inc('crypto', revenue, 100_000)]), R7);
  it('年間収入が300万円を超えると、事業所得・業務に係る雑所得になりうる旨を注記する（境界）', () => {
    expect(c(3_000_000).notes.join()).not.toMatch(/暗号資産の年間収入/);
    expect(c(3_000_001).notes.join()).toMatch(/暗号資産の年間収入が3,000,000円を超えています.*事業所得/);
  });
  it('雑所得として収入−経費（譲渡原価・手数料など）で所得を計算し、総合課税に合算される', () => {
    expect(c(1_000_000).income.comprehensive).toBe(900_000);
  });
  it('赤字は他の所得と通算しない（FAQ 2-11）', () => {
    const r = calculate(mk([inc('salary', 3_000_000), inc('crypto', 100_000, 600_000)]), R7);
    expect(r.income.miscLossIgnored).toBe(500_000);
  });
  it('出典として国税庁FAQを登録している', () => {
    expect(R7.sources.some((s) => s.id === 'NTA_CRYPTO_FAQ')).toBe(true);
    expect(R7.crypto.businessRevenueThreshold).toBe(3_000_000);
  });
});

// ---------------------------------------------------------------------------
// 上場株式等の譲渡益・配当（申告分離課税）: 所得税15%＋住民税5%、損失は区分内で通算し3年繰越（国税庁「株式・配当・利子と税」）
// ---------------------------------------------------------------------------
describe('上場株式等（申告分離課税）', () => {
  const ls = (profit, patch = {}) => calculate(mk([inc('listedStock', profit)], patch), R7);
  it('利益100万円のみ（令和7年分）: FXと同じ分離課税の率で手計算', () => {
    // 所得税: 基礎(132万以下)950,000 → 課税50,000 → 15%=7,500、復興floor(157.5)=157 → 7,657
    // 住民税: 基礎430,000 → 課税570,000×5%=28,500 + 均等割等5,000 = 33,500 / 手取り=1,000,000-7,657-33,500=958,843
    const r = ls(1_000_000);
    expect(r.income.listed).toMatchObject({ profit: 1_000_000, income: 1_000_000 });
    expect(r.income.comprehensive).toBe(0); // 総合課税には入らない
    expect(r.taxable.incomeTax).toMatchObject({ comprehensive: 0, listed: 50_000 });
    expect(r.incomeTax).toMatchObject({ listedTax: 7_500, total: 7_657 });
    expect(r.residentTax.total).toBe(33_500);
    expect(r.takeHome).toBe(958_843);
  });
  it('損失は総合課税の所得と通算せず、翌年以後3年間繰り越す', () => {
    const r = calculate(mk([inc('salary', 3_000_000), inc('listedStock', -200_000)]), R7);
    expect(r.income.comprehensive).toBe(2_020_000); // 給与300万円-給与所得控除(30%+8万円)。上場株式等の損失は引かない
    expect(r.income.listed.carryNext).toEqual([{ year: 2025, amount: 200_000 }]);
    expect(r.notes.join()).toMatch(/上場株式等の損失は総合課税の所得と通算せず/);
    expect(r.notes.join()).toMatch(/NISA口座の損失は、ないものとみなされ/);
  });
  it('繰越損失を控除する（年ごと・3年以内）', () => {
    const r = ls(300_000, { listedCarryLosses: [{ year: 2024, amount: 100_000 }, { year: 2021, amount: 50_000 }] });
    expect(r.income.listed).toMatchObject({ carryUsed: 100_000, income: 200_000 });
    expect(r.income.listed.carryExpired).toEqual([{ year: 2021, amount: 50_000 }]);
  });
  it('FX・先物の損失と上場株式等の損益は別々に通算する（互いに引かない）', () => {
    const r = calculate(mk([inc('fx', -100_000), inc('listedStock', 300_000)], { fxCarryLosses: [{ year: 2024, amount: 80_000 }] }), R7);
    expect(r.income.listed).toMatchObject({ profit: 300_000, carryUsed: 0, income: 300_000 }); // FXの繰越は使えない
    expect(r.income.fx.carryNext).toEqual([{ year: 2024, amount: 80_000 }, { year: 2025, amount: 100_000 }]);
  });
  it('総合課税で引ききれない所得控除は、FX・先物 → 上場株式等 の順に分離課税の所得から引く（架空データ）', () => {
    // 基礎控除480,000円。FX300,000円から先に引く（控除300,000円）→ 残り180,000円を上場株式等400,000円から引く → 課税220,000円
    // 税=220,000×15%=33,000、復興floor(660)=660 → 33,660 → 100円未満切捨 33,600
    const r = calculate(mk([inc('fx', 300_000), inc('listedStock', 400_000)]), R);
    expect(r.taxable.incomeTax).toMatchObject({ comprehensive: 0, fx: 0, listed: 220_000, spillToFx: 480_000, unusedDeduction: 0 });
    expect(r.incomeTax.total).toBe(33_600);
  });
  it('確定申告の要否の判定（給与以外の所得20万円超）にも含める', () => {
    expect(calculate(mk([inc('salary', 5_000_000), inc('listedStock', 300_000)]), R7).filing.status).toBe('required');
  });
  it('「その他の株式等」は従来どおり簡易扱い（分離課税の所得は税額に含めない）', () => {
    const r = calculate(mk([inc('securities', 500_000)]), R7);
    expect(r.income.listed.income).toBe(0);
    expect(r.notes.join()).toMatch(/分離課税/);
  });
});

// ---------------------------------------------------------------------------
// 雑損控除: 国税庁 No.1110（住民税も同じ式）
// ---------------------------------------------------------------------------
describe('雑損控除', () => {
  // 事業所得300万円（白色）→ 総所得金額等3,000,000円 → ×10% = 300,000円
  const cas = (box) => {
    const s = mk([inc('business', 3_000_000)]);
    s.deductions.casualty = { loss: 0, related: 0, disasterRelated: 0, insurance: 0, ...box };
    return calculate(s, R7);
  };
  it('(1)が大きい場合: 損害200万円・保険金50万円', () => {
    // (1)=(2,000,000+0-500,000)-300,000=1,200,000 / (2)=(0-0)-50,000<0 → 1,200,000円
    const r = cas({ loss: 2_000_000, insurance: 500_000 });
    expect(item(r, 'incomeTax', 'casualty')).toMatchObject({ amount: 1_200_000, mode: 'manual' });
    expect(item(r, 'residentTax', 'casualty').amount).toBe(1_200_000);
    // 所得税: 控除=基礎880,000+雑損1,200,000 → 課税920,000 → 5%=46,000、復興966 → 46,966
    expect(r.incomeTax.total).toBe(46_966);
  });
  it('(2)が大きい場合: 損害10万円・災害関連支出40万円', () => {
    // (1)=(100,000+400,000-0)-300,000=200,000 / (2)=(400,000-0)-50,000=350,000 → 350,000円
    expect(item(cas({ loss: 100_000, related: 400_000, disasterRelated: 400_000 }), 'incomeTax', 'casualty').amount).toBe(350_000);
  });
  it('保険金等は、まず損害金額から差し引き、超える分を災害関連支出から差し引く', () => {
    // 損害100,000・災害関連支出300,000・保険金150,000: (1)=(100,000+300,000-150,000)-300,000=-50,000
    // (2)=(300,000-(150,000-100,000))-50,000=200,000 → 200,000円
    expect(item(cas({ loss: 100_000, related: 300_000, disasterRelated: 300_000, insurance: 150_000 }), 'incomeTax', 'casualty').amount).toBe(200_000);
  });
  it('総所得金額等の10%以内の損害は控除なし／入力がなければ0円', () => {
    expect(item(cas({ loss: 300_000 }), 'incomeTax', 'casualty').amount).toBe(0); // (1)=300,000-300,000=0
    expect(item(cas({}), 'incomeTax', 'casualty').amount).toBe(0);
    expect(item(cas({ loss: 300_001 }), 'incomeTax', 'casualty').amount).toBe(1);
  });
  it('災害関連支出は災害等関連支出を超えない', () => {
    // related=100,000・disasterRelated=900,000(誤入力)→100,000として扱う: (2)=100,000-50,000=50,000 / (1)=100,000-300,000<0 → 50,000
    expect(item(cas({ related: 100_000, disasterRelated: 900_000 }), 'incomeTax', 'casualty').amount).toBe(50_000);
  });
});

describe('合計所得金額は損失の繰越控除の適用前、総所得金額等は適用後（国税庁 専門用語集）', () => {
  const rules25 = getTaxYear(2025);
  it('FXの繰越損失を引く前の合計所得金額で基礎控除を判定する（令和7年分: 132万円超336万円以下は88万円）', () => {
    const s = defaultState();
    s.taxYear = 2025;
    s.insurance = { type: 'none', actualAnnual: null, monthlyPremium: null, nationalPension: false };
    s.incomes = [{ ...newIncome('fx'), amount: 1_400_000 }];
    s.fxCarryLosses = [{ year: 2024, amount: 300_000 }];
    const r = calculate(s, rules25);
    // 合計所得金額 140万円（繰越控除の前）→ 基礎控除88万円。総所得金額等 110万円（繰越控除の後）
    expect(r.income.total).toBe(1_400_000);
    expect(r.income.totalNet).toBe(1_100_000);
    expect(r.deductions.incomeTax.items.find((i) => i.id === 'basic').amount).toBe(880_000);
    // FXの課税所得 = 110万円 − 88万円 = 22万円 → 所得税15% = 33,000円、復興特別所得税 693円
    expect(r.taxable.incomeTax.fx).toBe(220_000);
    expect(r.incomeTax.total).toBe(33_693);
  });
  it('繰越控除がなければ、合計所得金額と総所得金額等は同じ', () => {
    const s = defaultState();
    s.taxYear = 2025;
    s.incomes = [{ ...newIncome('fx'), amount: 500_000 }];
    const r = calculate(s, rules25);
    expect(r.income.total).toBe(500_000);
    expect(r.income.totalNet).toBe(500_000);
  });
  it('住民税の非課税: 均等割は合計所得金額（繰越控除の前）、所得割は総所得金額等（繰越控除の後）で判定する', () => {
    const s = defaultState();
    s.taxYear = 2025;
    s.insurance = { type: 'none', actualAnnual: null, monthlyPremium: null, nationalPension: false };
    s.incomes = [{ ...newIncome('fx'), amount: 600_000 }];
    s.fxCarryLosses = [{ year: 2024, amount: 300_000 }];
    const r = calculate(s, rules25);
    // 単身の限度は 35万円+10万円 = 45万円。合計所得金額60万円は超える（均等割は課税）。総所得金額等30万円は45万円以下（所得割は非課税）
    expect(r.residentTax.exemption).toBe('levy');
    expect(r.residentTax.perCapita).toBe(5_000);
    expect(r.residentTax.incomeLevy).toBe(0);
  });
});

describe('所得金額調整控除（子ども・特別障害者等を有する者等。国税庁 No.1411）', () => {
  const rules25 = getTaxYear(2025);
  const base = (salary, dependents = [], self = {}) => {
    const s = defaultState();
    s.taxYear = 2025;
    s.insurance = { type: 'none', actualAnnual: null, monthlyPremium: null, nationalPension: false };
    s.incomes = [{ ...newIncome('salary'), amount: salary }];
    s.dependents = dependents;
    Object.assign(s.self, self);
    return s;
  };
  const child = (age, extra = {}) => ({ id: `c${age}`, name: '', relationship: 'child', age, cohabiting: true, income: 0, disability: 'none', ...extra });

  it('給与950万円・10歳の子: (950万−850万)×10% = 10万円を給与所得から控除 → 所得税966,376円', () => {
    // 給与所得 = 950万 − 195万 = 755万 → 調整控除後 745万 / 基礎控除58万円（令和7年分・合計所得2,350万円以下）
    // 課税所得 = 745万 − 58万 = 687万 → 20%−427,500 = 946,500 / 復興 floor(946,500×2.1%) = 19,876 → 966,376
    const r = calculate(base(9_500_000, [child(10)]), rules25);
    expect(r.deductions.incomeTax.items.find((i) => i.id === 'basic').amount).toBe(580_000);
    expect(r.incomeTax.total).toBe(966_376);
    expect(r.notes.join()).toMatch(/所得金額調整控除100,000円を給与所得から差し引いています（所得税・住民税とも）/);
  });
  it('対象外なら控除なし（子なし・本人が特別障害者でない）: 課税所得697万円 → 23%−636,000 = 967,100 → 復興込み987,409円', () => {
    const r = calculate(base(9_500_000), rules25);
    expect(r.incomeTax.total).toBe(987_409);
    expect(r.notes.join()).not.toMatch(/所得金額調整控除/);
  });
  it('給与がちょうど850万円なら対象外（850万円を超える場合に限る）', () => {
    const withKid = calculate(base(8_500_000, [child(10)]), rules25);
    const noKid = calculate(base(8_500_000), rules25);
    expect(withKid.incomeTax.total).toBe(noKid.incomeTax.total);
  });
  it('収入は1,000万円が上限: 1,200万円でも (1,000万−850万)×10% = 15万円', () => {
    const r = calculate(base(12_000_000, [child(10)]), rules25);
    expect(r.notes.join()).toMatch(/所得金額調整控除150,000円/);
  });
  it('23歳未満の扶養親族: 22歳は対象、23歳は対象外', () => {
    expect(calculate(base(9_500_000, [child(22)]), rules25).notes.join()).toMatch(/所得金額調整控除/);
    expect(calculate(base(9_500_000, [child(23)]), rules25).notes.join()).not.toMatch(/所得金額調整控除/);
  });
  it('本人が特別障害者、または特別障害者の扶養親族がいる場合も対象', () => {
    expect(calculate(base(9_500_000, [], { disability: 'special' }), rules25).notes.join()).toMatch(/所得金額調整控除/);
    expect(calculate(base(9_500_000, [child(40, { disability: 'special' })]), rules25).notes.join()).toMatch(/所得金額調整控除/);
    expect(calculate(base(9_500_000, [], { disability: 'general' }), rules25).notes.join()).not.toMatch(/所得金額調整控除/);
  });
  it('所得の要件を満たさない子（所得が基準超）は扶養親族でないため対象外', () => {
    expect(calculate(base(9_500_000, [child(20, { income: 700_000 })]), rules25).notes.join()).not.toMatch(/所得金額調整控除/);
  });
  it('住民税にも同じ算式で反映（津山市の公式ページ）: 住民税の課税所得 = 給与所得755万円 − 調整控除10万円 − 所得控除', () => {
    const r = calculate(base(9_500_000, [child(10)]), rules25);
    // 住民税の所得控除: 基礎43万円（子10歳は扶養控除なし）。課税所得 = 755万 − 10万 − 43万 = 702万円
    expect(r.deductions.residentTax.total).toBe(430_000);
    expect(r.taxable.residentTax.comprehensive).toBe(7_020_000);
    const none = calculate(base(9_500_000), rules25);
    expect(none.taxable.residentTax.comprehensive).toBe(7_120_000); // 調整なしなら 755万 − 43万
  });
});

describe('雑所得と暗号資産は同じ計算（暗号資産は新しく選ぶ欄に出さない）', () => {
  const same = (cat) => calculate(mk([inc(cat, 1_000_000, 300_000)]), R7);
  it('同じ収入・経費なら、所得・税額・手取りが完全に一致する', () => {
    const a = same('misc'); const b = same('crypto');
    expect(a.income.total).toBe(b.income.total);
    expect([a.incomeTax.total, a.residentTax.total, a.takeHome]).toEqual([b.incomeTax.total, b.residentTax.total, b.takeHome]);
  });
  it('雑所得でも収入が300万円を超えたら、事業所得との区分の注記を出す（暗号資産以外の基準は未確認と明記）', () => {
    expect(calculate(mk([inc('misc', 3_000_000, 0)]), R7).notes.join()).not.toMatch(/雑所得の年間収入が/);
    expect(calculate(mk([inc('misc', 3_000_001, 0)]), R7).notes.join()).toMatch(/雑所得の年間収入が3,000,000円を超えています.*暗号資産以外の副業の区分の基準は未確認/);
  });
});
