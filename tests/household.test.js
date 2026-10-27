// 世帯（かんたん入力）の判定。期待値は国税庁・福山市の資料の表から手計算した値（コードから生成していない）。
// 令和7年分: 所得税 ひとり親35万・老人扶養(同居老親)58万/(その他)48万・特別障害者40万/同居特別障害者75万、
//            住民税(福山市 令和8年度) ひとり親30万・老人扶養 同居老親45万/その他38万・特別障害者30万/同居特別障害者53万。
import { describe, expect, it } from 'vitest';
import { assess, applyHousehold, scenarioState } from '../src/interview/assess.js';
import { defaultState } from '../src/core/schema.js';
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
    me: { certificate: 'none', partner: null },
    people: [
      person('parent', { id: 'mother', age: 72, incomeKind: 'business', revenue: 500_000, certificate: 'unknown', medical: true, ...over.mother }),
      person('parent', { id: 'father', age: 73, incomeKind: 'pension', revenue: 0, ...over.father }),
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

  it('父は年金収入から所得を換算できないため要確認（公的年金等控除の表が未登録）', () => {
    const a = assess(sample(), rules);
    const father = line(a, 'father', 'dependent');
    expect(father.status).toBe('maybe');
    expect(father.conds.some((c) => c.s === 'unknown' && c.t.includes('公的年金等控除'))).toBe(true);
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
    expect(applyHousehold(s, rules)).toBe(true);
    expect(s.self.widowSingleParent).toBe('singleParent');
    expect(s.dependents.map((d) => d.id)).toEqual(['mother', 'k1', 'k2']); // 父は所得を確定できないため含めない
    expect(s.dependents[0].disability).toBe('special');
    expect(applyHousehold(s, rules)).toBe(false);
  });

  it('確定分の state は、旧入力で同じ人を入れた場合と同じ結果になる（同値）', () => {
    const s = sample({ mother: { livesTogether: true, supportedByMe: true, certificate: 'phys12' } });
    s.household.me.partner = false;
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
