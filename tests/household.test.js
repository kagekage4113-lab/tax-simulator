// 世帯（かんたん入力）の判定。期待値は国税庁・福山市の資料の表から手計算した値（コードから生成していない）。
// 令和7年分: 所得税 ひとり親35万・老人扶養(同居老親)58万/(その他)48万・特別障害者40万/同居特別障害者75万、
//            住民税(福山市 令和8年度) ひとり親30万・老人扶養 同居老親45万/その他38万・特別障害者30万/同居特別障害者53万。
import { describe, expect, it } from 'vitest';
import { assess, applyHousehold, scenarioState } from '../src/interview/assess.js';
import { defaultState, newIncome } from '../src/core/schema.js';
import { newPerson } from '../src/core/household.js';
import { getTaxYear } from '../src/data/taxYears/index.js';

const rules = getTaxYear(2025);
const person = (kind, o) => ({ ...newPerson(kind), ...o });

// ユーザーの例: 母72（透析・事業収入50万）、父73（厚生年金のみ）、本人39、子15・13、配偶者なし
function sample(over = {}) {
  const s = defaultState();
  s.taxYear = 2025;
  s.self.age = 39;
  s.incomes[0].amount = 5_000_000;
  s.household = {
    enabled: true,
    me: { certificate: 'none', partner: null, childClaimedElsewhere: null },
    people: [
      person('parent', { id: 'mother', age: 72, incomeKind: 'business', revenue: 500_000, certificate: 'unknown', medical: true, ...over.mother }),
      person('parent', { id: 'father', age: 73, incomeKind: 'pension', revenue: 1_940_000, ...over.father }),
      person('child', { id: 'k1', age: 15 }),
      person('child', { id: 'k2', age: 13 }),
    ],
  };
  return s;
}
const line = (a, who, id) => a.cards.find((c) => c.who === who).lines.find((l) => l.id === id);

describe('世帯: 未回答は確定させない', () => {
  it('同居・生計・手帳が未回答なら、確定分には含めず「要確認」で最大額を示す', () => {
    const a = assess(sample(), rules);
    const mother = line(a, 'mother', 'dependent');
    expect(mother.status).toBe('maybe');
    expect(mother.amounts.now).toEqual({ it: 0, rt: 0 });
    // 同居なら同居老親等: 所得税58万・住民税45万
    expect(mother.amounts.max).toEqual({ it: 580_000, rt: 450_000 });
    const dis = line(a, 'mother', 'disability');
    expect(dis.status).toBe('maybe');
    expect(dis.amounts.now).toEqual({ it: 0, rt: 0 });
    expect(dis.amounts.max).toEqual({ it: 750_000, rt: 530_000 }); // 同居特別障害者
  });

  it('父は年金収入194万円: 65歳以上は 収入−110万円 = 84万円（No.1600）で、基準58万円を超えるため対象外', () => {
    const a = assess(sample(), rules);
    const father = line(a, 'father', 'dependent');
    expect(father.status).toBe('no');
    expect(father.amounts.max).toEqual({ it: 0, rt: 0 });
    expect(father.conds.some((c) => c.s === 'ng' && c.t.includes('84万円'))).toBe(true);
  });

  it('年金収入が110万円以下（65歳以上）なら所得0円で扶養の候補になる', () => {
    const a = assess(sample({ father: { revenue: 1_100_000, supportedByMe: true, livesTogether: true } }), rules);
    const father = line(a, 'father', 'dependent');
    expect(father.status).toBe('applies');
    expect(father.amounts.now).toEqual({ it: 580_000, rt: 450_000 });
  });

  it('子15歳は扶養控除の対象外（16歳未満）。ひとり親控除は事実婚の回答待ちなら要確認', () => {
    const a = assess(sample(), rules);
    expect(line(a, 'k1', 'dependent').status).toBe('no');
    const sp = line(a, 'me', 'singleParent');
    expect(sp.status).toBe('maybe');
    expect(sp.amounts.now).toEqual({ it: 0, rt: 0 });
    expect(sp.amounts.max).toEqual({ it: 350_000, rt: 300_000 });
  });

  it('事実婚の相手がいない・生計の回答がそろうと確定する', () => {
    const s = sample({ mother: { livesTogether: true, supportedByMe: true, certificate: 'phys12' } });
    s.household.me.partner = false;
    s.household.me.childClaimedElsewhere = false;
    const a = assess(s, rules);
    expect(line(a, 'me', 'singleParent').status).toBe('applies');
    expect(line(a, 'me', 'singleParent').amounts.now).toEqual({ it: 350_000, rt: 300_000 });
    expect(line(a, 'mother', 'dependent').amounts.now).toEqual({ it: 580_000, rt: 450_000 });
    expect(line(a, 'mother', 'disability').amounts.now).toEqual({ it: 750_000, rt: 530_000 });
  });

  it('別居の母（生計一）は同居老親等にならず、特別障害者も同居の加算なし', () => {
    const a = assess(sample({ mother: { livesTogether: false, supportedByMe: true, certificate: 'phys12' } }), rules);
    expect(line(a, 'mother', 'dependent').amounts.now).toEqual({ it: 480_000, rt: 380_000 });
    expect(line(a, 'mother', 'disability').amounts.now).toEqual({ it: 400_000, rt: 300_000 });
  });

  it('身体障害者手帳3級は一般障害者（所得税27万・住民税26万）', () => {
    const a = assess(sample({ mother: { livesTogether: true, supportedByMe: true, certificate: 'phys3plus' } }), rules);
    expect(line(a, 'mother', 'disability').amounts.now).toEqual({ it: 270_000, rt: 260_000 });
  });

  it('生計を一にしない親は対象外（確定分にも上限にも入らない）', () => {
    const a = assess(sample({ mother: { supportedByMe: false, livesTogether: false } }), rules);
    const l = line(a, 'mother', 'dependent');
    expect(l.status).toBe('no');
    expect(l.amounts.max).toEqual({ it: 0, rt: 0 });
  });

  it('所得が基準(58万円)を超える親は扶養対象外', () => {
    const a = assess(sample({ mother: { supportedByMe: true, incomeKind: 'business', revenue: 900_000, expenses: 100_000 } }), rules);
    expect(line(a, 'mother', 'dependent').status).toBe('no');
  });

  it('配偶者がいるとひとり親控除は対象外', () => {
    const s = sample();
    s.household.people.push(person('spouse', { id: 'sp', age: 38, supportedByMe: true, livesTogether: true }));
    s.household.me.partner = false;
    expect(line(assess(s, rules), 'me', 'singleParent').status).toBe('no');
  });
});

describe('世帯: 手取りの上限と確定分', () => {
  it('要確認がすべて当てはまると、控除が増えて手取りが増える（確定分より少なくならない）', () => {
    const a = assess(sample(), rules);
    expect(a.rOptimistic.takeHome).toBeGreaterThan(a.rConfirmed.takeHome);
    expect(a.asks.length).toBeGreaterThan(0);
  });

  it('applyHousehold は確定分だけを state に反映し、変化がなければ false', () => {
    const s = sample({ mother: { livesTogether: true, supportedByMe: true, certificate: 'phys12' } });
    s.household.me.partner = false;
    s.household.me.childClaimedElsewhere = false;
    expect(applyHousehold(s, rules)).toBe(true);
    expect(s.self.widowSingleParent).toBe('singleParent');
    expect(s.dependents.map((d) => d.id)).toEqual(['mother', 'k1', 'k2']); // 父は「生活費を負担」が未回答のため含めない
    expect(s.dependents[0].disability).toBe('special');
    expect(applyHousehold(s, rules)).toBe(false);
  });

  it('確定分の state は、旧入力で同じ人を入れた場合と同じ結果になる（同値）', () => {
    const s = sample({ mother: { livesTogether: true, supportedByMe: true, certificate: 'phys12' } });
    s.household.me.partner = false;
    s.household.me.childClaimedElsewhere = false;
    const S = scenarioState(s, rules, 'confirmed');
    const legacy = defaultState();
    legacy.taxYear = 2025; legacy.self.age = 39; legacy.incomes[0].amount = 5_000_000;
    legacy.self.widowSingleParent = 'singleParent';
    legacy.dependents = [
      { id: 'm', name: '', relationship: 'parent', age: 72, cohabiting: true, income: 500_000, disability: 'special' },
      { id: 'a', name: '', relationship: 'child', age: 15, cohabiting: true, income: 0, disability: 'none' },
      { id: 'b', name: '', relationship: 'child', age: 13, cohabiting: true, income: 0, disability: 'none' },
    ];
    const pick = (x) => ({ self: x.self, spouse: x.spouse, dependents: x.dependents.map(({ id, ...r }) => r) });
    expect(pick(S)).toEqual(pick(legacy));
  });
});

describe('ひとり親控除の子の条件（No.1171）', () => {
  const base = () => {
    const s = defaultState();
    s.taxYear = 2025; s.self.age = 39; s.incomes[0].amount = 5_000_000;
    s.household = { enabled: true, me: { certificate: 'none', partner: false, childClaimedElsewhere: false }, people: [person('child', { id: 'k', age: 15 })] };
    return s;
  };
  it('子の所得が基準（令和7年分58万円）以下なら対象、超えると対象外', () => {
    const s = base();
    s.household.people[0].incomeKind = 'other'; s.household.people[0].revenue = 580_000;
    expect(line(assess(s, rules), 'me', 'singleParent').status).toBe('applies');
    s.household.people[0].revenue = 580_001;
    expect(line(assess(s, rules), 'me', 'singleParent').status).toBe('no');
  });
  it('令和8年分の基準は62万円', () => {
    const s = base(); s.taxYear = 2026;
    s.household.people[0].incomeKind = 'other'; s.household.people[0].revenue = 620_000;
    expect(line(assess(s, getTaxYear(2026)), 'me', 'singleParent').status).toBe('applies');
    s.household.people[0].revenue = 620_001;
    expect(line(assess(s, getTaxYear(2026)), 'me', 'singleParent').status).toBe('no');
  });
  it('子が他の人の扶養親族等になっていると対象外、未回答なら要確認', () => {
    const s = base();
    s.household.me.childClaimedElsewhere = true;
    expect(line(assess(s, rules), 'me', 'singleParent').status).toBe('no');
    s.household.me.childClaimedElsewhere = null;
    expect(line(assess(s, rules), 'me', 'singleParent').status).toBe('maybe');
  });
  it('合計所得金額が500万円を超えると金額は0円（エンジンが判定）', () => {
    const s = base(); s.incomes[0].amount = 8_000_000;
    const l = line(assess(s, rules), 'me', 'singleParent');
    expect(l.status).toBe('no');
    expect(l.amounts.now).toEqual({ it: 0, rt: 0 });
  });
});

import { calculate } from '../src/calc/engine.js';
describe('任意継続の健康保険', () => {
  const st = () => { const s = defaultState(); s.taxYear = 2025; s.incomes[0].amount = 3_000_000; s.insurance.type = 'voluntary'; return s; };
  it('毎月の保険料×12に、別に払う国民年金（月17,920円×12）を加える', () => {
    const s = st(); s.insurance.monthlyPremium = 25_000;
    expect(calculate(s, rules).socialInsurance.total).toBe(300_000);
    s.insurance.nationalPension = true;
    expect(calculate(s, rules).socialInsurance.total).toBe(300_000 + 215_040);
  });
  it('毎月の保険料が未入力なら確定させない（手取りは null、理由を missing に出す）', () => {
    const r = calculate(st(), rules);
    expect(r.socialInsurance.total).toBeNull();
    expect(r.takeHome).toBeNull();
    expect(r.missing).toContain('socialInsurance.voluntaryPremium');
  });
  it('国民年金の対象年齢（20〜59歳）外なら含めない', () => {
    const s = st(); s.self.age = 62; s.insurance.monthlyPremium = 20_000; s.insurance.nationalPension = true;
    expect(calculate(s, rules).socialInsurance.total).toBe(240_000);
  });
  it('旧データ（任意継続の項目なし）も読み込める', async () => {
    const { validateState } = await import('../src/core/schema.js');
    const old = defaultState(); delete old.insurance.monthlyPremium; delete old.insurance.nationalPension;
    const r = validateState(old);
    expect(r.ok).toBe(true);
    expect(r.state.insurance.monthlyPremium).toBeNull();
  });
});

import { AREAS, getTaxYear as gty, rulesOf } from '../src/data/taxYears/index.js';
describe('地域（東京23区・福山市）', () => {
  it('住民税の均等割は東京23区5,000円・福山市5,500円。控除額などの法定の値は同じ', () => {
    const t = gty(2025, 'tokyo23'); const f = gty(2025);
    expect(t.residentTax.perCapita).toBe(5_000);
    expect(f.residentTax.perCapita).toBe(5_500);
    expect(t.deductions).toBe(f.deductions);
    expect(t.residentTax.nonTaxable).toEqual(f.residentTax.nonTaxable);
    expect(Object.keys(AREAS)).toEqual(['tokyo23', 'fukuyama']);
  });
  it('旧データ（地域の記載なし）は福山市として読み込み、新規の既定は東京23区', async () => {
    const { validateState } = await import('../src/core/schema.js');
    const old = defaultState(); delete old.residence.area;
    expect(validateState(old).state.residence.area).toBe('fukuyama');
    expect(defaultState().residence.area).toBe('tokyo23');
    expect(defaultState().residence.prefecture).toBe('東京都');
    expect(validateState({ ...defaultState(), residence: { prefecture: '', city: '', area: 'mars' } }).ok).toBe(false);
  });
  it('rulesOf は state の年度と地域で選ぶ', () => {
    const s = defaultState(); s.taxYear = 2026;
    expect(rulesOf(s).residentTax.scope).toBe('東京23区');
    s.residence.area = 'fukuyama';
    expect(rulesOf(s).residentTax.scope).toBe('福山市（広島県）');
  });
});

describe('東京23区の国民健康保険料（令和7年度の特別区の標準的な料率）', () => {
  it('個人事業主・所得300万円・39歳・単身: 国保 + 国民年金', () => {
    // 所得割の基礎 = 300万円 − 基礎控除43万円 = 257万円（旧ただし書方式）
    // 基礎分: 2,570,000×7.71% = 198,147 + 均等割47,300 = 245,447（限度額66万円以内）
    // 支援金分: 2,570,000×2.69% = 69,133 + 16,800 = 85,933（限度額26万円以内）。介護分は40歳未満のため対象外
    // 国民年金: 17,920円×12 = 215,040円 → 合計 546,420円
    const s = defaultState();
    s.taxYear = 2025; s.self.age = 39;
    s.insurance = { type: 'national', actualAnnual: null, monthlyPremium: null, nationalPension: false };
    s.incomes = [{ ...newIncome('business'), amount: 3_000_000, expenses: 0 }];
    s.filing = { type: 'white', blueDeduction: 10 };
    const r = calculate(s, rulesOf(s));
    expect(r.socialInsurance.total).toBe(546_420);
    expect(r.notes.join()).toMatch(/東京23区/);
  });
  it('40〜64歳は介護分（均等割16,600円・所得割2.25%）が加わる', () => {
    // 41歳: 上記 + 介護分 2,570,000×2.25% = 57,825 + 16,600 = 74,425 → 546,420 + 74,425 = 620,845
    const s = defaultState();
    s.taxYear = 2025; s.self.age = 41;
    s.insurance = { type: 'national', actualAnnual: null, monthlyPremium: null, nationalPension: false };
    s.incomes = [{ ...newIncome('business'), amount: 3_000_000, expenses: 0 }];
    expect(calculate(s, rulesOf(s)).socialInsurance.total).toBe(620_845);
  });
  it('賦課限度額（基礎分66万円・支援金分26万円・介護分17万円）で頭打ちになる', () => {
    const s = defaultState();
    s.taxYear = 2025; s.self.age = 50;
    s.insurance = { type: 'national', actualAnnual: null, monthlyPremium: null, nationalPension: false };
    s.incomes = [{ ...newIncome('business'), amount: 20_000_000, expenses: 0 }];
    // 基礎・支援金・介護の合計上限 660,000 + 260,000 + 170,000 = 1,090,000 + 国民年金 215,040 = 1,305,040
    expect(calculate(s, rulesOf(s)).socialInsurance.total).toBe(1_305_040);
  });
});
