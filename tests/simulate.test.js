// 期待値は手計算（コメントに過程）。令和7年分の実データ（R7）と、境界確認用の架空データを使う。
import { describe, expect, it } from 'vitest';
import { compareExpense, compareIncome, fxTiming, sweepIncome, withIncomeAdded } from '../src/calc/simulate.js';
import { wallDefinitions } from '../src/calc/walls.js';
import { calculate } from '../src/calc/engine.js';
import { defaultState, newIncome } from '../src/core/schema.js';
import { getTaxYear } from '../src/data/taxYears/index.js';
import { syntheticRules } from './fixtures/syntheticRules.js';

const R7 = getTaxYear(2025);
const inc = (category, amount, expenses = 0, extra = {}) => ({ ...newIncome(category), amount, expenses, ...extra });
const mk = (incomes, patch = {}) => Object.assign(defaultState(), { taxYear: 2025, insurance: { type: 'none', actualAnnual: null }, incomes }, patch);

// 基準: 給与500万円・社保実額70万円（令和7年分）
//   所得税123,030円 / 住民税246,000円 / 社保700,000円 → 負担1,069,030円 / 手取り3,930,970円
const salaryState = () => mk([inc('salary', 5_000_000)], { insurance: { type: 'employee', actualAnnual: 700_000 } });

describe('追加収入の比較（6.1・6.3）', () => {
  it('雑所得(副業)で+50万円（経費なし）: 手計算', () => {
    // 総合所得=3,560,000+500,000=4,060,000 / 所得税: 控除=基礎680,000(≦489万)+社保700,000 → 課税2,680,000 → 268,000-97,500=170,500, 復興floor(3,580.5)=3,580 → 174,080（+51,050）
    // 住民税: 課税=4,060,000-1,130,000=2,930,000 → 293,000-調整2,500=290,500+5,500=296,000（+50,000）
    // 負担増=101,050 → 限界負担率=101,050÷500,000=20.21% / 手取り増=500,000-101,050=398,950
    const c = compareIncome(salaryState(), R7, { target: { category: 'misc' }, add: 500_000 });
    expect(c.available).toBe(true);
    expect(c.diff).toMatchObject({ revenue: 500_000, income: 500_000, incomeTax: 51_050, residentTax: 50_000, businessTax: 0, socialInsurance: 0, burden: 101_050, takeHome: 398_950 });
    expect(c.ma.takeHome).toBe(4_329_920);
    expect(c.marginalRate).toBeCloseTo(20.21, 2);
  });
  it('給与を+50万円: 給与所得控除(20%)を通すため所得増は40万円', () => {
    // 給与550万 → 控除=1,100,000+440,000=1,540,000 → 給与所得3,960,000
    // 所得税: 課税=3,960,000-1,380,000=2,580,000 → 160,500, 復興3,370 → 163,870（+40,840） / 住民税: 課税2,830,000 → 283,000-2,500+5,500=286,000（+40,000）
    // 負担増80,840 → 16.168%
    const s = salaryState();
    const c = compareIncome(s, R7, { target: { id: s.incomes[0].id }, add: 500_000 });
    expect(c.diff).toMatchObject({ income: 400_000, incomeTax: 40_840, residentTax: 40_000, burden: 80_840 });
    expect(c.marginalRate).toBeCloseTo(16.168, 3);
  });
  it('追加経費を指定すると所得の増加が小さくなる（雑所得+50万円・経費20万円）', () => {
    // 所得+300,000 → 総合3,860,000 → 課税=3,860,000-1,380,000=2,480,000 → 248,000-97,500=150,500, 復興3,160(=150,500×0.021=3,160.5) → 153,660
    //   住民税: 課税=3,860,000-1,130,000=2,730,000 → 273,000-2,500=270,500+5,500=276,000
    //   負担増=(153,660-123,030)+(276,000-246,000)=30,630+30,000=60,630
    const c = compareIncome(salaryState(), R7, { target: { category: 'misc' }, add: 500_000, extraExpenses: 200_000 });
    expect(c.diff).toMatchObject({ revenue: 500_000, income: 300_000, burden: 60_630 });
  });
  it('追加収入0円のときは限界負担率を計算しない', () => {
    expect(compareIncome(salaryState(), R7, { target: { category: 'misc' }, add: 0 }).marginalRate).toBeNull();
  });
  it('現在の入力状態は変更されない', () => {
    const s = salaryState();
    const snapshot = JSON.stringify(s);
    compareIncome(s, R7, { target: { category: 'misc' }, add: 500_000 });
    withIncomeAdded(s, { id: s.incomes[0].id }, 100_000);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
  it('税制データ未登録なら比較できない（available=false）', () => {
    const c = compareIncome(salaryState(), { year: 1 }, { target: { category: 'misc' }, add: 500_000 });
    expect(c.available).toBe(false);
    expect(c.marginalRate).toBeNull();
  });
  it('社保が実額入力のときは増減を含めない旨を注記する', () => {
    expect(compareIncome(salaryState(), R7, { target: { category: 'misc' }, add: 500_000 }).notes.join()).toMatch(/社会保険料は実額入力/);
  });
  it('FXの利益を+50万円: 総合課税と別に固定税率で計算される', () => {
    // 総合課税で所得控除を使い切っているためFX課税=500,000 → 15%=75,000 / 基準所得税額=120,500+75,000=195,500 / 復興floor(4,105.5)=4,105 → 199,605
    // 所得税の増加=199,605-123,030=76,575 / 総合課税の所得は3,560,000のまま
    const s = salaryState();
    const c = compareIncome(s, R7, { target: { category: 'fx' }, add: 500_000 });
    expect(c.after.income.comprehensive).toBe(3_560_000);
    expect(c.after.incomeTax.fxTax).toBe(75_000);
    expect(c.after.incomeTax.total).toBe(199_605);
    expect(c.diff.incomeTax).toBe(76_575);
    expect(c.diff.residentTax).toBe(25_000); // FX課税500,000×5%（住民税の基礎控除は総合課税で使い切り済み）
  });
});

describe('経費の変更（6.2）: 支出と税負担の減少を分けて表示', () => {
  // 事業売上400万・経費100万・白色・社保なし → 所得300万
  //   所得税: 基礎880,000 → 課税2,120,000 → 114,500, 復興2,404 → 116,904 / 住民税: 課税2,570,000 → 257,000-2,500+5,500=260,000 → 負担376,904 / 手取り2,623,096
  const biz = () => mk([inc('business', 4_000_000, 1_000_000)]);
  it('経費+20万円', () => {
    // 所得280万 → 所得税: 課税1,920,000 → 5%=96,000, 復興2,016 → 98,016 / 住民税: 課税2,370,000 → 237,000-2,500+5,500=240,000 → 負担338,016
    // 税負担の減少=376,904-338,016=38,888 / 手元に残るお金の変化=-200,000+38,888=-161,112
    const s = biz();
    const c = compareExpense(s, R7, { targetId: s.incomes[0].id, delta: 200_000 });
    expect(c.mb.burden).toBe(376_904);
    expect(c.ma.burden).toBe(338_016);
    expect(c.taxChange).toBe(-38_888);
    expect(c.cashChange).toBe(-161_112);
    expect(c.applied).toBe(200_000);
  });
  it('経費を減らす場合も計算でき、0円未満にはならない', () => {
    const s = biz();
    const c = compareExpense(s, R7, { targetId: s.incomes[0].id, delta: -5_000_000 });
    expect(c.applied).toBe(-1_000_000); // 経費100万円までしか減らせない
    expect(c.after.income.businessNet).toBe(4_000_000);
  });
});

describe('壁と逆転（6.4）', () => {
  it('税率区分の壁: 給与500万円から収入を増やすと、課税所得が330万円を超える+141万円で税率20%になる', () => {
    // 課税所得=2,180,000+0.8×追加収入（給与所得控除20%）。10%→20%の境界3,300,000円超は 追加1,410,000円の区間（1,400,000円ちょうどは3,300,000円）
    const s = salaryState();
    const sw = sweepIncome(s, R7, { target: { id: s.incomes[0].id }, max: 2_000_000, step: 10_000 });
    const w = sw.walls.find((x) => x.id === 'incomeTaxBracket1');
    expect(w.add).toBe(1_410_000);
    expect(w.label).toMatch(/10%→20%/);
    expect(w.marginalAfter).toBeGreaterThan(w.marginalBefore);
  });
  it('基礎控除の段階の壁: 合計所得が489万円を超える+166万円で基礎控除が68万→63万円に減る', () => {
    // 給与660万円超は給与所得控除が収入×10%+110万円になり、所得は0.9倍で増える。合計所得=0.9×(5,000,000+追加)-1,100,000
    // 追加1,650,000円で4,885,000円（以下）、1,660,000円で4,894,000円（超）
    const s = salaryState();
    const sw = sweepIncome(s, R7, { target: { id: s.incomes[0].id }, max: 2_000_000, step: 10_000 });
    const w = sw.walls.find((x) => x.label.includes('基礎控除（所得税）が68万円→63万円'));
    expect(w.add).toBe(1_660_000);
    expect(w.jump).toBeGreaterThan(0); // この区間で負担が段差的に増える
  });
  it('手取りが逆転する（収入が増えて手取りが減る）区間を検出する: 架空データ（基礎控除48万円が24,000,000円超で0）', () => {
    const s = mk([inc('business', 23_990_000)], { taxYear: 2025 });
    const sw = sweepIncome(s, syntheticRules, { target: { id: s.incomes[0].id }, max: 50_000, step: 10_000 });
    // 追加10,000円で24,000,000円ちょうど（控除あり）、20,000円で超える → 所得税が48万円×30%=144,000円ほど増える
    expect(sw.reversals).toHaveLength(1);
    expect(sw.reversals[0]).toMatchObject({ from: 10_000, to: 20_000 });
    expect(sw.reversals[0].drop).toBeGreaterThan(100_000);
    const w = sw.walls.find((x) => x.label.includes('基礎控除（所得税）'));
    expect(w.add).toBe(20_000);
  });
  it('通常の連続区間では逆転しない', () => {
    const s = salaryState();
    const sw = sweepIncome(s, R7, { target: { id: s.incomes[0].id }, max: 1_000_000, step: 100_000 });
    expect(sw.reversals).toEqual([]);
    expect(sw.points[0].gain).toBe(0);
    expect(sw.points.every((p, i) => i === 0 || p.takeHome > sw.points[i - 1].takeHome)).toBe(true);
  });
  it('住民税の非課税ラインの壁: 本人のみ・事業所得45万円→45万円超で住民税がかかる', () => {
    const s = mk([inc('business', 400_000)]);
    const sw = sweepIncome(s, R7, { target: { id: s.incomes[0].id }, max: 100_000, step: 10_000 });
    const w = sw.walls.find((x) => x.label.includes('住民税（均等割・所得割）が非課税でなくなる'));
    expect(w.add).toBe(60_000); // 400,000+60,000=460,000 > 450,000（50,000では450,000で非課税のまま）
  });
  it('壁の定義は税制データから作る: 配偶者がいれば配偶者控除の壁（900万・950万・1,000万円超）が出る', () => {
    const s = mk([inc('business', 1_000_000)]);
    s.spouse = { exists: true, age: 40, income: 0, disability: 'none', cohabiting: true };
    const ws = wallDefinitions(s, R7).filter((w) => w.id.startsWith('spouseOwner'));
    expect(ws.map((w) => w.threshold)).toEqual([9_000_000, 9_500_000, 10_000_000]);
    expect(wallDefinitions(mk([]), R7).some((w) => w.id.startsWith('spouseOwner'))).toBe(false);
  });
  it('個人事業税の壁（事業所得が事業主控除290万円を超える）は、対象業種の事業所得があるときだけ出る', () => {
    const typed = mk([inc('business', 2_000_000, 0, { businessType: 'type1' })]);
    expect(wallDefinitions(typed, R7).some((w) => w.id === 'businessTax')).toBe(true);
    expect(wallDefinitions(mk([inc('business', 2_000_000)]), R7).some((w) => w.id === 'businessTax')).toBe(false);
  });
});

describe('国保税の法定軽減の壁（個人事業主・二次情報）', () => {
  // 事業所得70万円・本人のみ（45歳）: 軽減の基準額は 7割=43万円 / 5割=74万円 / 2割=100万円（世帯の判定用所得）
  const st = () => mk([inc('business', 700_000)], { insurance: { type: 'national', actualAnnual: null }, self: { ...defaultState().self, age: 45 } });
  it('壁は税制データと世帯構成から作る（被保険者の人数で基準額が変わる）', () => {
    const ws = wallDefinitions(st(), R7).filter((w) => w.id.startsWith('kokuhoReduction'));
    expect(ws.map((w) => w.threshold)).toEqual([430_000, 740_000, 1_000_000]);
    expect(ws.map((w) => w.label)).toEqual(['国保税の法定軽減が7割から5割に下がる', '国保税の法定軽減が5割から2割に下がる', '国保税の法定軽減が2割からなしに下がる']);
    const two = { ...st(), spouse: { exists: true, age: 43, income: 0, disability: 'none', cohabiting: true } };
    expect(wallDefinitions(two, R7).filter((w) => w.id.startsWith('kokuhoReduction')).map((w) => w.threshold)).toEqual([430_000, 430_000 + 310_000 * 2, 430_000 + 570_000 * 2]);
  });
  it('実額入力のときは国保の壁を出さない（保険料が変わらないため）', () => {
    expect(wallDefinitions({ ...st(), insurance: { type: 'national', actualAnnual: 300_000 } }, R7).some((w) => w.id.startsWith('kokuhoReduction'))).toBe(false);
  });
  it('所得が増えると、5割→2割（+5万円）、2割→なし（+31万円）で段差が出て、後者は手取りが逆転する', () => {
    const s = st();
    const sw = sweepIncome(s, R7, { target: { id: s.incomes[0].id }, max: 400_000, step: 10_000 });
    expect(sw.walls.find((w) => w.label.includes('5割から2割')).add).toBe(50_000);
    const last = sw.walls.find((w) => w.label.includes('2割からなし'));
    expect(last.add).toBe(310_000);
    expect(last.jump).toBeGreaterThan(10_000); // 1,000,000円→1,010,000円で保険税が約1.7万円増える
    expect(sw.reversals.some((r) => r.from === 300_000 && r.to === 310_000)).toBe(true);
  });
});

describe('FXの利確タイミング比較（6.5）', () => {
  // FXのみ（他の所得なし）。来年は「今年と同じ収入・同じ税制」の仮定。令和7年分の実データ。
  const base = () => mk([]);
  it('所得控除の余り（今年は収入なし）: 所得税950,000円・住民税430,000円', () => {
    const t = fxTiming(base(), R7, { unrealized: 1_000_000, realize: 0 });
    expect(t.slack).toEqual({ incomeTax: 950_000, residentTax: 430_000 });
  });
  it('含み益100万円: 全額を1年に集めると、控除の余りを使えず税負担が増える', () => {
    // 全額今年: 所得税 FX課税=1,000,000-950,000=50,000→7,500+復興157=7,657 / 住民税 FX課税570,000×5%=28,500+均等割5,500=34,000 → 41,657、来年0
    // 全額来年: 今年0（住民税も非課税）、来年41,657
    const t = fxTiming(base(), R7, { unrealized: 1_000_000, realize: 0 });
    expect(t.all.totalBurden).toBe(41_657);
    expect(t.now.totalBurden).toBe(41_657);
  });
  it('半分ずつ利確: 毎年の所得控除を使えるため税負担が減る', () => {
    // 各年500,000円: 所得税=0（基礎控除950,000円の範囲）/ 住民税=(500,000-430,000)×5%=3,500+均等割5,500=9,000（合計所得50万円>45万円で課税）→ 2年で18,000
    const e = fxTiming(base(), R7, { unrealized: 1_000_000, realize: 500_000 }).evaluate(500_000);
    expect(e.thisBurden).toBe(9_000);
    expect(e.nextBurden).toBe(9_000);
    expect(e.totalBurden).toBe(18_000);
  });
  it('税負担が最小になる利確額を探す: 今年55万円・来年45万円（来年が非課税ライン45万円以内）で11,500円', () => {
    // 今年550,000: 住民税=(550,000-430,000)×5%=6,000+均等割5,500=11,500、所得税0 / 来年450,000: 合計所得45万円以下で住民税非課税 → 0 → 合計11,500
    const t = fxTiming(base(), R7, { unrealized: 1_000_000, realize: 0 });
    expect(t.best.realize).toBe(550_000);
    expect(t.best.totalBurden).toBe(11_500);
  });
  it('繰越損失があれば、利確で消化される（30万円の繰越→利益100万円のうち30万円を控除）', () => {
    const s = mk([], { fxCarryLosses: [{ year: 2024, amount: 300_000 }] });
    const t = fxTiming(s, R7, { unrealized: 1_000_000, realize: 1_000_000 });
    expect(t.all.thisYear.income.fx).toMatchObject({ carryUsed: 300_000, income: 700_000 });
  });
  it('現在の入力状態は変更されない', () => {
    const s = mk([inc('salary', 3_000_000)]);
    const snap = JSON.stringify(s);
    fxTiming(s, R7, { unrealized: 500_000, realize: 100_000 });
    expect(JSON.stringify(s)).toBe(snap);
  });
});

describe('エンジンの変更がシミュレーションの基準と整合している', () => {
  it('基準状態の結果が既存の手計算と一致（所得税123,030・住民税246,000・手取り3,930,970）', () => {
    const r = calculate(salaryState(), R7);
    expect([r.incomeTax.total, r.residentTax.total, r.takeHome]).toEqual([123_030, 246_000, 3_930_970]);
  });
});
