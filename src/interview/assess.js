// 世帯の事実（core/household.js）から、既存の計算エンジンに渡す state と、控除ごとの判定理由を作る。
// 金額・所得基準・年齢基準は年度別の税制データ（rules）から読む。ここには税額を書かない。
//
// 2通りの前提で state を作る:
//   confirmed  … 回答がそろい、条件を満たすと確認できたものだけ適用する（未回答は適用しない）
//   optimistic … 未回答の条件がすべて当てはまった場合（上限の目安）
// 画面は両方の結果を並べ、「要確認が全部当てはまると手取りがいくら変わるか」を示す。
import { calculate } from '../calc/engine.js';
import { autoPersonalDeductions } from '../calc/autoDeductions.js';
import { defaultState, newIncome } from '../core/schema.js';
import { formatYen } from '../core/money.js';
import { newPerson } from '../core/household.js';

const REL = { child: 'child', parent: 'parent', other: 'other' };
const resolve = (v, scenario) => (v === null || v === undefined ? scenario === 'optimistic' : v);
export const man = (n) => (n == null ? '—' : n % 10000 === 0 ? `${n / 10000}万円` : `${formatYen(n)}円`);

// 手帳の種類・等級 → 障害者控除の区分（国税庁 No.1160）。unsure は「確認が必要」。
export function certClass(cert, scenario) {
  switch (cert) {
    case 'phys12': case 'mental1': return { cls: 'special', unsure: false };
    case 'phys3plus': case 'mentalOther': return { cls: 'general', unsure: false };
    case 'other': case 'unknown': return { cls: scenario === 'optimistic' ? 'special' : 'none', unsure: true };
    default: return { cls: 'none', unsure: false };
  }
}

// 本人以外の人の「所得」（合計所得金額の見込み）。換算できないときは value: null（推測しない）。
export function personIncome(p, rules, taxYear) {
  switch (p.incomeKind) {
    case 'none': return { value: 0 };
    case 'other': return { value: p.revenue };
    case 'business': return { value: Math.max(0, p.revenue - p.expenses), note: '売上から経費を引いた額（青色申告特別控除などは考慮しない）' };
    case 'salary': {
      const r = calculate({ ...defaultState(), taxYear, insurance: { type: 'none', actualAnnual: 0 }, incomes: [{ ...newIncome('salary'), amount: p.revenue }] }, rules);
      return r.income.salaryIncome == null ? { value: null, reason: '給与所得控除の表が未登録です' } : { value: r.income.salaryIncome };
    }
    case 'pension': return { value: null, reason: '公的年金等控除の表が未登録のため、年金収入から所得を計算できません' };
    default: return { value: null, reason: '収入が分からないため、所得を確定できません' };
  }
}

function peopleFacts(state, rules, scenario) {
  return state.household.people.map((p) => {
    const inc = personIncome(p, rules, state.taxYear);
    const cert = certClass(p.certificate, scenario);
    return {
      p, inc, cert,
      supported: resolve(p.supportedByMe, scenario),
      cohabiting: resolve(p.livesTogether, scenario),
      income: inc.value ?? 0,
      counted: resolve(p.supportedByMe, scenario) && (inc.value !== null || scenario === 'optimistic'),
    };
  });
}

// ひとり親控除の条件（国税庁 No.1170 の「ひとり親に該当しない」前提と、福山市の資料の要件）。子の所得基準は No.1171 未入手のため、所得0の子のみ確認済みとして扱う。
function singleParentConds(state, facts, rules, totalIncome) {
  const hh = state.household;
  const conds = [];
  const hasSpouse = hh.people.some((p) => p.kind === 'spouse');
  conds.push(hasSpouse ? { s: 'ng', t: '配偶者がいる（ひとり親は、12月31日に婚姻していない人などが対象）' } : { s: 'ok', t: '配偶者はいない' });
  conds.push(hh.me.partner === false ? { s: 'ok', t: '事実上婚姻関係と同様の事情にある人はいない' }
    : hh.me.partner === true ? { s: 'ng', t: '事実上婚姻関係と同様の事情にある人がいる（対象外）' }
      : { s: 'unknown', t: '事実上婚姻関係と同様の事情にある人がいないか未回答' });
  const kids = facts.filter((f) => f.p.kind === 'child');
  const okKid = kids.find((f) => f.p.supportedByMe === true && f.inc.value === 0);
  const maybeKid = kids.find((f) => f.p.supportedByMe !== false && !(f.p.supportedByMe === true && f.inc.value === 0));
  if (okKid) conds.push({ s: 'ok', t: `生計を一にする子がいる（${okKid.p.name || `${okKid.p.age}歳`}・所得なし）` });
  else if (maybeKid) conds.push({ s: 'unknown', t: '生計を一にする子がいるか、子の所得が基準以下か未確認（子の所得基準の資料 No.1171 は未登録）' });
  else conds.push({ s: 'ng', t: '生計を一にする子がいない' });
  const max = rules.deductions?.incomeTax?.widowSingleParentIncomeMax;
  if (max != null) {
    conds.push(totalIncome == null ? { s: 'unknown', t: `あなたの合計所得金額が${man(max)}以下か（収入を入力すると判定されます）` }
      : totalIncome <= max ? { s: 'ok', t: `あなたの合計所得金額は${man(max)}以下` } : { s: 'ng', t: `あなたの合計所得金額が${man(max)}を超える` });
  }
  return conds;
}

const statusOf = (conds) => (conds.some((c) => c.s === 'ng') ? 'no' : conds.some((c) => c.s === 'unknown') ? 'maybe' : 'applies');
const tri = (v) => (v === true ? 'ok' : v === false ? 'ng' : 'unknown');

// 指定の前提での state（self・spouse・dependents を世帯の事実から導く）。他の項目は state のまま。
export function scenarioState(state, rules, scenario) {
  const facts = peopleFacts(state, rules, scenario);
  const S = { ...state, self: { ...state.self }, spouse: { ...state.spouse }, dependents: [] };
  S.dependents = facts.filter((f) => f.p.kind !== 'spouse' && f.counted).map((f) => ({
    id: f.p.id, name: f.p.name, relationship: REL[f.p.kind] || 'other', age: f.p.age,
    cohabiting: f.cohabiting, income: f.income, disability: f.cert.cls,
  }));
  const sp = facts.find((f) => f.p.kind === 'spouse' && f.counted);
  S.spouse = sp
    ? { exists: true, age: sp.p.age, income: sp.income, disability: sp.cert.cls, cohabiting: sp.cohabiting }
    : { ...state.spouse, exists: false, income: 0, disability: 'none' };
  S.self.disability = certClass(state.household.me.certificate, scenario).cls;
  const conds = singleParentConds(state, facts, rules, null).filter((c) => !c.t.includes('合計所得金額')); // 所得上限はエンジンが判定
  const st = statusOf(conds);
  S.self.widowSingleParent = (scenario === 'optimistic' ? st !== 'no' : st === 'applies') ? 'singleParent' : 'none';
  return S;
}

// 画面用: 世帯の事実を、控除ごとの判定・理由・金額（確定分／要確認が全部当てはまる場合）にする。
export function assess(state, rules) {
  const confirmed = scenarioState(state, rules, 'confirmed');
  const optimistic = scenarioState(state, rules, 'optimistic');
  const rConfirmed = calculate(confirmed, rules);
  const rOptimistic = calculate(optimistic, rules);
  const totalIncome = rConfirmed.income.total;
  const dIT = rules.deductions?.incomeTax;
  const factsNow = peopleFacts(state, rules, 'confirmed');

  const amountIn = (S, who, id, kind) => {
    const d = rules.deductions?.[kind];
    if (!d) return null;
    let mini;
    const noSelf = { ...S.self, disability: 'none', widowSingleParent: 'none', workingStudent: false };
    if (who === 'me') mini = { ...S, spouse: { ...S.spouse, exists: false }, dependents: [] };
    else if (who.p.kind === 'spouse') mini = { ...S, self: noSelf, dependents: [] };
    else mini = { ...S, self: noSelf, spouse: { ...S.spouse, exists: false }, dependents: S.dependents.filter((x) => x.id === who.p.id) };
    const it = autoPersonalDeductions(mini, d, totalIncome, () => {}, kind).find((x) => x.id === id);
    return it ? it.amount : 0;
  };
  const amounts = (who, id) => ({
    now: { it: amountIn(confirmed, who, id, 'incomeTax'), rt: amountIn(confirmed, who, id, 'residentTax') },
    max: { it: amountIn(optimistic, who, id, 'incomeTax'), rt: amountIn(optimistic, who, id, 'residentTax') },
  });

  const cards = [];
  // あなた
  {
    const lines = [];
    const kids = state.household.people.some((p) => p.kind === 'child');
    if (kids) {
      const conds = singleParentConds(state, factsNow, rules, totalIncome);
      lines.push({ id: 'singleParent', label: 'ひとり親控除', status: statusOf(conds), conds, amounts: amounts('me', 'widowSingleParent') });
    }
    const mc = state.household.me.certificate;
    if (mc !== 'none') {
      const c = certClass(mc, 'optimistic');
      const conds = [{ s: c.unsure ? 'unknown' : 'ok', t: c.unsure ? '手帳の種類・等級が未確認' : '手帳の区分から判定' }];
      lines.push({ id: 'disability', label: '障害者控除', status: statusOf(conds), conds, amounts: amounts('me', 'disability') });
    }
    cards.push({ who: 'me', lines });
  }

  for (const f of peopleFacts(state, rules, 'confirmed')) {
    const p = f.p;
    const lines = [];
    const suppCond = { s: tri(p.supportedByMe), t: p.supportedByMe === true ? '生活費の大半をあなたが負担している（生計を一にする）' : p.supportedByMe === false ? '生計を一にしていない（対象外）' : '生活費の大半をあなたが負担しているか未回答' };
    const incOf = (limit) => (f.inc.value === null ? { s: 'unknown', t: `所得を確定できません（${f.inc.reason}）` }
      : f.inc.value <= limit ? { s: 'ok', t: `所得は${man(f.inc.value)}（基準の${man(limit)}以下）` }
        : { s: 'ng', t: `所得は${man(f.inc.value)}（基準の${man(limit)}を超える）` });
    if (p.kind === 'spouse') {
      const c = dIT?.spouse;
      if (c) {
        const stepsMax = c.specialSteps[c.specialSteps.length - 1].upTo;
        const conds = [suppCond, incOf(stepsMax)];
        lines.push({ id: 'spouse', label: '配偶者控除・配偶者特別控除', status: statusOf(conds), conds, amounts: amounts(f, 'spouse') });
      }
    } else {
      const c = dIT?.dependent;
      if (c) {
        const conds = [suppCond, incOf(c.incomeMax),
          p.age >= c.general.minAge ? { s: 'ok', t: `${p.age}歳（${c.general.minAge}歳以上が対象）` } : { s: 'ng', t: `${p.age}歳は${c.general.minAge}歳未満のため扶養控除の対象外（障害者控除・ひとり親控除などは別に判定します）` }];
        const am = amounts(f, 'dependent');
        lines.push({ id: 'dependent', label: `扶養控除${p.age >= (c.elder?.minAge ?? 200) ? '（老人扶養親族' + (p.kind === 'parent' ? '・同居なら同居老親等）' : '）') : ''}`, status: statusOf(conds), conds, amounts: am });
      }
      const sr = dIT?.specificRelative;
      if (sr) {
        const am = amounts(f, 'specificRelative');
        if ((am.now.it ?? 0) > 0 || (am.max.it ?? 0) > 0) {
          const conds = [suppCond, { s: 'ok', t: `所得${man(f.inc.value)}が${man(sr.incomeMin)}を超え${man(sr.incomeMax)}以下、${sr.ageMin}〜${sr.ageMax}歳` }];
          lines.push({ id: 'specificRelative', label: '特定親族特別控除', status: statusOf(conds), conds, amounts: am });
        }
      }
    }
    if (p.certificate !== 'none') {
      const cc = certClass(p.certificate, 'optimistic');
      const limit = p.kind === 'spouse' ? dIT?.spouse?.spouseIncomeMax : dIT?.dependent?.incomeMax;
      const conds = [suppCond, limit != null ? incOf(limit) : { s: 'unknown', t: '所得基準の資料が未登録' },
        { s: cc.unsure ? 'unknown' : 'ok', t: cc.unsure ? '手帳の種類・等級が未確認（等級で金額が変わります）' : '手帳の区分から判定（国税庁 No.1160）' }];
      lines.push({ id: 'disability', label: '障害者控除', status: statusOf(conds), conds, amounts: amounts(f, 'disability') });
    }
    cards.push({ who: p.id, lines, medical: p.medical });
  }

  const asks = cards.flatMap((c) => c.lines.flatMap((l) => l.conds.filter((x) => x.s === 'unknown').map((x) => x.t)));
  return { confirmed, optimistic, rConfirmed, rOptimistic, cards, asks: [...new Set(asks)] };
}

// 旧入力（配偶者・扶養親族）から世帯の人に変換する（かんたん入力に切り替えるとき、入力済みの内容を失わないため）。
export function importLegacyPeople(state) {
  const certOf = (d) => (d === 'special' ? 'phys12' : d === 'general' ? 'phys3plus' : 'none');
  const out = [];
  if (state.spouse.exists) {
    out.push({ ...newPerson('spouse'), age: state.spouse.age, livesTogether: state.spouse.cohabiting, supportedByMe: true, incomeKind: 'other', revenue: state.spouse.income, certificate: certOf(state.spouse.disability) });
  }
  for (const d of state.dependents) {
    const kind = d.relationship === 'child' ? 'child' : d.relationship === 'parent' || d.relationship === 'grandparent' ? 'parent' : 'other';
    out.push({ ...newPerson(kind), id: d.id, name: d.name, age: d.age, livesTogether: d.cohabiting, supportedByMe: true, incomeKind: 'other', revenue: d.income, certificate: certOf(d.disability) });
  }
  return out;
}

// state の self・spouse・dependents を、確定分の前提で世帯の事実から上書きする。変更があれば true。
export function applyHousehold(state, rules) {
  if (!state.household.enabled || !rules) return false;
  const S = scenarioState(state, rules, 'confirmed');
  const key = () => JSON.stringify([state.self, state.spouse, state.dependents]);
  const before = key();
  state.self.disability = S.self.disability;
  state.self.widowSingleParent = S.self.widowSingleParent;
  state.spouse = S.spouse;
  state.dependents = S.dependents;
  return before !== key();
}
