// かんたん入力（世帯）: 人を追加し、生活の事実を答えると、控除の判定と理由・金額が出る（試作）。
// 税額は計算エンジンが出す。ここは入力と表示だけ。入力欄はフォーカスを保つため、判定欄だけを更新する。
import { h, field, select, checkbox, badge } from './dom.js';
import { gaugeField } from './gaugeField.js';
import { CERTIFICATES, INCOME_KINDS, PERSON_KINDS, newPerson } from '../core/household.js';
import { insuranceFields } from './sections.js';
import { assess, applyHousehold, importLegacyPeople, man, missingFacts, overview } from '../interview/assess.js';
import { rulesOf } from '../data/taxYears/index.js';
import { formatYen } from '../core/money.js';

const STATUS = { applies: ['適用の見込み', 'ok'], maybe: ['要確認', 'warn'], no: ['対象外', ''] };
const MARK = { ok: '✔', ng: '✖', unknown: '？' };

// はい／いいえ／分からない（null = 未回答）
// needed が true で値が null（未回答）のあいだは赤く示す。
function tri(label, value, onChange, needed = true) {
  const labels = ['はい', 'いいえ', '分からない'];
  const opts = [[true, labels[0]], [false, labels[1]], [null, labels[2]]];
  // 必須の質問で null（分からない・未回答）のあいだは、どれも選ばれていない見た目にして、赤く示す
  const isOn = (opt, cur) => cur === opt && !(needed && opt === null);
  const group = h('div', { class: 'seg', role: 'group', 'aria-label': label },
    opts.map(([v, text]) => h('button', {
      type: 'button', 'aria-pressed': String(isOn(v, value)), class: isOn(v, value) ? 'on' : '',
      onClick: () => { onChange(v); wrap.classList.toggle('missing', needed && v === null); group.querySelectorAll('button').forEach((b, i) => { const on = isOn(opts[i][0], v); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); },
    }, text)));
  const wrap = h('div', { class: `field${needed && value === null ? ' missing' : ''}` }, h('span', { class: 'lbl' }, label, h('span', { class: 'miss-tag' }, '未回答')), group);
  return wrap;
}

// 値が未確認のあいだ赤く示す（select・数値欄の外側の div に付ける）
const markIf = (el, cond) => { el.classList.toggle('missing', !!cond); return el; };

const amountText = (l) => {
  const { now, max } = l.amounts;
  const t = (a) => (a.it == null ? '金額データ未登録' : `所得税 ${man(a.it)}・住民税 ${man(a.rt)}`);
  if (l.status === 'applies') return `控除額: ${t(now)}`;
  if (l.status === 'maybe') return `確認できれば 控除額: ${t(max)}（今の計算には含めていません）`;
  return '対象外のため、計算に含めません';
};

function verdictList(card) {
  if (!card || (!card.lines.length && !card.medical)) return h('p', { class: 'hint' }, 'この人について、いま判定する控除はありません。');
  return h('div', { class: 'verdicts' },
    ...card.lines.map((l) => {
      const [label, kind] = STATUS[l.status];
      return h('div', { class: `verdict v-${l.status}` },
        h('div', { class: 'v-head' }, h('strong', {}, l.label), badge(label, kind)),
        h('p', { class: 'v-amount' }, amountText(l)),
        h('ul', { class: 'v-conds' }, l.conds.map((c) => h('li', { class: `c-${c.s}` }, `${MARK[c.s]} ${c.t}`))));
    }),
    card.medical ? h('div', { class: 'verdict v-maybe' },
      h('div', { class: 'v-head' }, h('strong', {}, '医療費控除'), badge('金額の入力が必要', 'warn')),
      h('p', { class: 'v-amount' }, '生計を一にする家族の医療費は、あなたの医療費控除に合算できる場合があります。下の「所得控除・税額控除」の医療費に、支払額と補填される額を入力してください（通院の交通費も対象になる場合があります）。')) : null);
}

export function householdSection(store, rulesFor = rulesOf) {
  const s = store.get();
  const set = (fn, structural = false) => store.update(fn, { structural });
  const hh = s.household;
  const verdictBoxes = new Map(); // who('me' | 人のid) → 判定欄
  const totalsBox = h('div', { class: 'hh-totals' });
  const overviewBox = h('div', { class: 'hh-overview' });
  const missingBox = h('div', { class: 'hh-missing' });

  const el = h('details', { class: 'card', id: 'sec-household', open: true },
    h('summary', {}, '世帯・家族（かんたん入力・試作）'));
  const body = h('div', { class: 'body' });
  el.append(body);

  body.append(
    h('p', { class: 'note' }, '税金の用語ではなく、暮らしの事実（同居しているか・生活費を負担しているか・収入・手帳の有無）を答えると、当てはまりそうな控除と理由が出ます。答えが足りない項目は「要確認」とし、確定した分だけを手取りに反映します。'),
    checkbox('この入力方式を使う（オンにすると、従来の「本人・配偶者・扶養親族」欄の代わりにこちらから計算します）', hh.enabled, (on) => {
      set((x) => {
        x.household.enabled = on;
        if (on && x.household.people.length === 0 && (x.spouse.exists || x.dependents.length)) x.household.people = importLegacyPeople(x);
        if (on) applyHousehold(x, rulesFor(x));
      }, true);
    }));

  if (!hh.enabled) return Object.assign(el, { refresh() {} });

  body.append(missingBox, totalsBox, overviewBox);

  // あなた
  const meBox = h('div', {});
  verdictBoxes.set('me', meBox);
  const hasSpouse = hh.people.some((p) => p.kind === 'spouse');
  body.append(h('div', { class: 'item' },
    h('div', { class: 'item-head' }, h('strong', {}, 'あなた')),
    meBox,
    gaugeField({ compact: true, label: '年齢（12月31日時点）', value: s.self.age, max: 100, step: 1, unit: '歳', onChange: (v) => set((x) => { x.self.age = Math.min(v, 120); }) }),
    ...insuranceFields(store),
    (() => { const f = field('障害者手帳などはありますか', select(CERTIFICATES, hh.me.certificate, (v) => { markIf(f, v === 'unknown' || v === 'other'); set((x) => { x.household.me.certificate = v; }); })); return markIf(f, hh.me.certificate === 'unknown' || hh.me.certificate === 'other'); })(),
    !hasSpouse ? tri('事実上の婚姻関係（事実婚・同棲など、夫婦と同様の事情）にある人はいますか', hh.me.partner, (v) => set((x) => { x.household.me.partner = v; })) : null,
    !hasSpouse && hh.people.some((p) => p.kind === 'child')
      ? tri('お子さんを、元の配偶者など他の人の扶養に入れていませんか（入れている＝はい）', hh.me.childClaimedElsewhere, (v) => set((x) => { x.household.me.childClaimedElsewhere = v; })) : null));

  // 家族
  const miss0 = missingFacts(s);
  hh.people.forEach((p, i) => body.append(personCard(store, p, i, verdictBoxes, hh.people, miss0.filter((m) => m.who === p.id).length)));

  const add = (kind) => set((x) => { x.household.people.push(newPerson(kind)); applyHousehold(x, rulesFor(x)); }, true);
  body.append(
    h('div', { class: 'row' }, Object.entries(PERSON_KINDS).map(([k, label]) => h('button', {
      type: 'button', class: 'btn', onClick: () => add(k), disabled: k === 'spouse' && hasSpouse,
    }, `＋ ${label}を追加`))),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onClick: () => set((x) => {
      x.self.age = 39;
      x.household = { enabled: true, me: { certificate: 'none', partner: null, childClaimedElsewhere: null }, people: sampleHousehold() };
      applyHousehold(x, rulesFor(x));
    }, true) }, '例の世帯を入れてみる（母72・父73・子15と13）')),
    h('p', { class: 'hint' }, '判定は、あなたの申告（回答）に基づく目安です。控除の適用には証明書類が必要な場合があります。世帯の中で誰が扶養に入れるか（きょうだい・配偶者側との調整）は考慮せず、「この方をあなたの扶養に入れる」前提で計算します。'));

  el.refresh = (state) => {
    if (!state.household.enabled) return;
    const rules = rulesFor(state);
    if (!rules) return;
    const a = assess(state, rules);
    for (const c of a.cards) {
      const box = verdictBoxes.get(c.who);
      if (box) box.replaceChildren(verdictList(c));
    }
    totalsBox.replaceChildren(totals(a));
    overviewBox.replaceChildren(overviewView(overview(state, rules)));
    missingBox.replaceChildren(...missingView(missingFacts(state)));
  };
  el.refresh(s);
  return el;
}

function personCard(store, p, i, verdictBoxes, people, missingCount) {
  const set = (fn, structural = false) => store.update(fn, { structural });
  const upd = (key, val, structural) => set((x) => { x.household.people[i][key] = val; }, structural);
  const box = h('div', {});
  verdictBoxes.set(p.id, box);
  // 金額欄: 0円のままなら赤く示す（収入の種類を選んだのに金額が未入力、の見落とし防止）
  const money = (label, key, hint, { requiredNonZero = true } = {}) => {
    const f = gaugeField({ compact: true, label, value: p[key], max: 5_000_000, hint, onChange: (v) => { markIf(f, requiredNonZero && v === 0); upd(key, v); } });
    return markIf(f, requiredNonZero && p[key] === 0);
  };
  const incomeFields = [];
  if (p.incomeKind === 'salary') incomeFields.push(money('年間の給与収入（額面）', 'revenue'));
  if (p.incomeKind === 'pension') incomeFields.push(money('年金の年間受取額（年金振込通知書・源泉徴収票の金額）', 'revenue', '年金収入から公的年金等控除を引いて所得を求めます（国税庁 No.1600。年金以外の所得はない前提）。'));
  if (p.incomeKind === 'business') incomeFields.push(
    money('年間の売上', 'revenue'),
    money('年間の経費（なければ0円）', 'expenses', '売上から経費を引いた額（利益）が所得です。', { requiredNonZero: false }));
  if (p.incomeKind === 'other') incomeFields.push(money('年間の所得金額（収入から経費などを引いた後の額）', 'revenue'));

  const unsureCert = p.certificate === 'unknown' || p.certificate === 'other';
  const certField = field('障害者手帳などはありますか', select(CERTIFICATES, p.certificate, (v) => { markIf(certField, v === 'unknown' || v === 'other'); upd('certificate', v); }),
    { hint: '手帳の等級で一般障害者・特別障害者が決まります（国税庁 No.1160）。透析をされている方は、身体障害者手帳（腎臓機能障害）の等級を確認してください。' });
  markIf(certField, unsureCert);
  const kindField = field('収入の種類', select(INCOME_KINDS, p.incomeKind, (v) => upd('incomeKind', v, true)));
  markIf(kindField, p.incomeKind === 'unknown');

  const kindLabel = PERSON_KINDS[p.kind];
  return h('div', { class: `item${missingCount ? ' has-missing' : ''}` },
    h('div', { class: 'item-head' }, h('strong', {}, `${kindLabel}${p.name ? `：${p.name}` : ''}（${p.age}歳）`),
      h('button', { type: 'button', class: 'btn danger', onClick: () => set((x) => { x.household.people.splice(i, 1); }, true) }, '削除')),
    box,
    h('details', { class: 'edit', open: missingCount > 0 }, h('summary', {}, '回答を編集する', missingCount ? h('span', { class: 'miss-count' }, `（未回答 ${missingCount}件）`) : null),
      field('呼び名（メモ）', h('input', { type: 'text', value: p.name, maxlength: 100, placeholder: '例：母', onInput: (e) => upd('name', e.target.value) })),
      gaugeField({ compact: true, label: '年齢（12月31日時点）', value: p.age, max: 100, step: 1, unit: '歳', onChange: (v) => upd('age', Math.min(v, 120)) }),
      tri('同居していますか', p.livesTogether, (v) => upd('livesTogether', v)),
      tri('住民票の世帯は、あなたと同じですか（世帯分離していない）', p.sameHousehold, (v) => upd('sameHousehold', v), false),
      tri(p.kind === 'spouse' ? '生活費をあなたが主に負担していますか（生計を一にしていますか）' : '生活費の大半をあなたが負担していますか（仕送りを含む）', p.supportedByMe, (v) => upd('supportedByMe', v)),
      kindField,
      ...incomeFields,
      certField,
      checkbox('通院・入院などの医療費を払っている', p.medical, (v) => upd('medical', v)),
      p.kind === 'spouse' || p.kind === 'child' ? null : field('この家族の中の配偶者（夫婦で生計を一にしている相手）',
        select({ '': 'いない・この中にはいない', ...Object.fromEntries(people.filter((q) => q.id !== p.id && q.kind !== 'spouse' && q.kind !== 'child').map((q) => [q.id, `${PERSON_KINDS[q.kind]}${q.name ? `：${q.name}` : ''}（${q.age}歳）`])) }, p.partnerId || '', (v) => upd('partnerId', v || null, false)),
        { hint: '親どうしが夫婦なら、お互いを選びます。所得が基準以下の配偶者は「同一生計配偶者」として、相手の住民税の非課税の限度に数えられます。' })));
}

// 未回答の項目の一覧（上部）。0件なら出さない。
function missingView(list) {
  if (!list.length) return [];
  const byWho = new Map();
  for (const m of list) byWho.set(m.whoLabel, [...(byWho.get(m.whoLabel) || []), m.label]);
  return [h('div', { class: 'warn miss-box', role: 'status' },
    h('strong', {}, `まだ答えていない項目が${list.length}件あります（赤く表示）`),
    h('ul', {}, [...byWho.entries()].map(([who, labels]) => h('li', {}, `${who}：${labels.join('、')}`))),
    h('p', { class: 'hint' }, '答えが足りない控除は「要確認」とし、確定した分だけを手取りに反映します。')) ];
}

function totals(a) {
  const yen = (v) => (v == null ? '—' : `${formatYen(v)}円`);
  const c = a.rConfirmed; const o = a.rOptimistic;
  const diff = c.takeHome != null && o.takeHome != null ? o.takeHome - c.takeHome : null;
  return h('div', { class: 'hh-box' },
    h('h3', {}, '世帯を反映した結果'),
    h('table', { class: 'tbl cmp' },
      h('thead', {}, h('tr', {}, h('th', {}), h('th', {}, '確定分'), h('th', {}, '全部当てはまれば'))),
      h('tbody', {},
        h('tr', {}, h('th', {}, '所得税'), h('td', { class: 'r' }, yen(c.incomeTax?.total)), h('td', { class: 'r' }, yen(o.incomeTax?.total))),
        h('tr', {}, h('th', {}, '住民税'), h('td', { class: 'r' }, yen(c.residentTax?.total)), h('td', { class: 'r' }, yen(o.residentTax?.total))),
        h('tr', { class: 'strong' }, h('th', {}, '年間手取り'), h('td', { class: 'r' }, yen(c.takeHome)), h('td', { class: 'r' }, yen(o.takeHome))))),
    c.income.revenueTotal + c.income.fx.profit === 0 ? h('p', { class: 'warn' }, 'あなたの収入がまだ入力されていません。「現在の収入と経費」に入れると、手取りへの影響が出ます。') : null,
    diff === 0 && (c.taxable.incomeTax?.unusedDeduction ?? 0) > 0 ? h('p', { class: 'hint' }, `いまの所得では控除が${formatYen(c.taxable.incomeTax.unusedDeduction)}円余っているため、要確認がすべて当てはまっても税額は変わりません。`) : null,
    diff != null && diff !== 0 ? h('p', { class: 'hint' }, `要確認がすべて当てはまると、手取りは最大で${formatYen(diff)}円増えます。`) : null,
    a.asks.length ? h('details', { class: 'edit' }, h('summary', {}, `まだ確認が必要なこと（${a.asks.length}件）`), h('ul', { class: 'status-list' }, a.asks.map((t) => h('li', {}, t)))) : h('p', { class: 'hint' }, '確認が必要な項目はありません。'));
}

// 例の世帯（ユーザーの例）。同居・生計・手帳は未回答のままにして、「要確認」の見え方を確かめられるようにする。
function sampleHousehold() {
  const mk = (kind, o) => ({ ...newPerson(kind), ...o });
  return [
    mk('parent', { name: '母', age: 72, incomeKind: 'business', revenue: 500_000, certificate: 'unknown', medical: true }),
    mk('parent', { name: '父', age: 73, incomeKind: 'pension', revenue: 1_940_000 }),
    mk('child', { name: '子', age: 15 }),
    mk('child', { name: '子', age: 13 }),
  ];
}

const EXEMPT_LABEL = { all: '非課税', levy: '所得割のみ非課税（均等割は課税）' };
function overviewView(ov) {
  const yen = (v) => (v == null ? '—' : `${formatYen(v)}円`);
  const stateOf = (r) => (!r.known || r.exemption === undefined ? '不明' : r.exemption ? EXEMPT_LABEL[r.exemption] : '課税');
  const rows = ov.rows.map((r) => h('tr', { class: r.inHousehold ? '' : 'out' }, h('th', {}, `${r.name}（${r.age}歳）${r.inHousehold ? '' : '※世帯別'}`), h('td', { class: 'r' }, r.income == null ? '—' : yen(r.income)), h('td', { class: 'r' }, yen(r.incomeTax)), h('td', { class: 'r' }, yen(r.residentTax)), h('td', {}, stateOf(r))));
  return h('div', { class: 'hh-box' },
    h('h3', {}, '世帯の見取り図（誰の、何の税金か）'),
    h('p', { class: 'hint' }, '家族それぞれを「本人として」見た目安です（本人の所得・基礎控除・本人の障害・配偶者だけで計算し、社会保険料控除などは入れていません）。'),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl cmp' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, '所得'), h('th', {}, '所得税'), h('th', {}, '住民税'), h('th', {}, '住民税の状態'))),
      h('tbody', {}, rows))),
    ov.outside.length ? h('p', { class: 'hint' }, `住民票の世帯が別の人（${ov.outside.map((r) => r.name).join('、')}）は、「世帯全員が非課税か」の判定に入れていません。`) : null,
    ov.allNonTaxable === true ? h('p', {}, h('strong', {}, '世帯全員が住民税非課税です。'), ov.margin != null ? `あなたのFXの利益があと${manShort(ov.margin)}までなら、あなたが非課税のまま（世帯全員が非課税のまま）です。` : '') : null,
    ov.allNonTaxable === false ? h('p', { class: 'warn' }, `住民税が課税なのは ${ov.taxable.map((r) => r.name).join('、')} です。世帯全員が非課税ではありません。`) : null,
    ov.allNonTaxable === null ? h('p', { class: 'hint' }, `${ov.unknown.map((r) => r.name).join('、')} の所得が確定できないため、世帯全員が非課税かどうかは判定できません。`) : null,
    ov.unpaired ? h('p', { class: 'hint' }, '親どうしが夫婦なら、各人の「回答を編集する」を開き、「この家族の中の配偶者」でお互いを選んでください。所得が基準以下の配偶者がいると、相手の非課税の限度が大きくなり、結果が変わることがあります。') : null,
    h('details', { class: 'edit' }, h('summary', {}, '本人だけで決まるもの／世帯で決まるもの'),
      h('p', { class: 'hint' }, '【本人だけ】所得税・住民税の税額。住民税の非課税の判定（本人の所得と、本人の扶養人数・同一生計配偶者の人数で決まる限度額との比較）。'),
      h('p', { class: 'hint' }, '【世帯が関わる】国民健康保険料（加入者の人数・所得の合計、軽減の判定）。介護保険料の段階や、70歳以上の高額療養費の区分は、一般に、本人と世帯の住民税の課税状況（世帯全員が非課税か）で決まります。住民票の世帯が同居の家族と同じか別かでも変わります。これらの金額は、資料が未入手のため、このアプリでは計算していません。上の「世帯全員が非課税か」は、その判定の材料です。'),
      h('p', { class: 'hint' }, '誰を扶養に入れるか、世帯をどう分けるかの判断はしません。現在の入力から、どうなるかだけを示します。')));
}
const manShort = (n) => (n >= 10_000 ? `${Math.round(n / 1000) / 10}万円` : `${formatYen(n)}円`);
