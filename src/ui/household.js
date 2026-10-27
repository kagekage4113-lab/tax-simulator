// かんたん入力（世帯）: 人を追加し、生活の事実を答えると、控除の判定と理由・金額が出る（試作）。
// 税額は計算エンジンが出す。ここは入力と表示だけ。入力欄はフォーカスを保つため、判定欄だけを更新する。
import { h, field, select, checkbox, badge } from './dom.js';
import { gaugeField } from './gaugeField.js';
import { CERTIFICATES, INCOME_KINDS, PERSON_KINDS, newPerson } from '../core/household.js';
import { assess, applyHousehold, importLegacyPeople, man } from '../interview/assess.js';
import { getTaxYear } from '../data/taxYears/index.js';
import { formatYen } from '../core/money.js';

const STATUS = { applies: ['適用の見込み', 'ok'], maybe: ['要確認', 'warn'], no: ['対象外', ''] };
const MARK = { ok: '✔', ng: '✖', unknown: '？' };

// はい／いいえ／分からない（null = 未回答）
function tri(label, value, onChange, labels = ['はい', 'いいえ', '分からない']) {
  const opts = [[true, labels[0]], [false, labels[1]], [null, labels[2]]];
  const group = h('div', { class: 'seg', role: 'group', 'aria-label': label },
    opts.map(([v, text]) => h('button', {
      type: 'button', 'aria-pressed': String(value === v), class: value === v ? 'on' : '',
      onClick: () => { onChange(v); group.querySelectorAll('button').forEach((b, i) => { const on = opts[i][0] === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); },
    }, text)));
  return h('div', { class: 'field' }, h('span', { class: 'lbl' }, label), group);
}

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

export function householdSection(store, rulesFor = getTaxYear) {
  const s = store.get();
  const set = (fn, structural = false) => store.update(fn, { structural });
  const hh = s.household;
  const verdictBoxes = new Map(); // who('me' | 人のid) → 判定欄
  const totalsBox = h('div', { class: 'hh-totals' });

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
        if (on) applyHousehold(x, rulesFor(x.taxYear));
      }, true);
    }));

  if (!hh.enabled) return Object.assign(el, { refresh() {} });

  body.append(totalsBox);

  // あなた
  const meBox = h('div', {});
  verdictBoxes.set('me', meBox);
  const hasSpouse = hh.people.some((p) => p.kind === 'spouse');
  body.append(h('div', { class: 'item' },
    h('div', { class: 'item-head' }, h('strong', {}, 'あなた')),
    meBox,
    gaugeField({ compact: true, label: '年齢（12月31日時点）', value: s.self.age, max: 100, step: 1, unit: '歳', onChange: (v) => set((x) => { x.self.age = Math.min(v, 120); }) }),
    field('障害者手帳などはありますか', select(CERTIFICATES, hh.me.certificate, (v) => set((x) => { x.household.me.certificate = v; }))),
    !hasSpouse ? tri('事実上の婚姻関係（事実婚・同棲など、夫婦と同様の事情）にある人はいますか', hh.me.partner, (v) => set((x) => { x.household.me.partner = v; })) : null));

  // 家族
  hh.people.forEach((p, i) => body.append(personCard(store, p, i, verdictBoxes)));

  const add = (kind) => set((x) => { x.household.people.push(newPerson(kind)); applyHousehold(x, rulesFor(x.taxYear)); }, true);
  body.append(
    h('div', { class: 'row' }, Object.entries(PERSON_KINDS).map(([k, label]) => h('button', {
      type: 'button', class: 'btn', onClick: () => add(k), disabled: k === 'spouse' && hasSpouse,
    }, `＋ ${label}を追加`))),
    h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onClick: () => set((x) => {
      x.self.age = 39;
      x.household = { enabled: true, me: { certificate: 'none', partner: null }, people: sampleHousehold() };
      applyHousehold(x, rulesFor(x.taxYear));
    }, true) }, '例の世帯を入れてみる（母72・父73・子15と13）')),
    h('p', { class: 'hint' }, '判定は、あなたの申告（回答）に基づく目安です。控除の適用には証明書類が必要な場合があります。世帯の中で誰が扶養に入れるか（きょうだい・配偶者側との調整）は考慮せず、「この方をあなたの扶養に入れる」前提で計算します。'));

  el.refresh = (state) => {
    if (!state.household.enabled) return;
    const rules = rulesFor(state.taxYear);
    if (!rules) return;
    const a = assess(state, rules);
    for (const c of a.cards) {
      const box = verdictBoxes.get(c.who);
      if (box) box.replaceChildren(verdictList(c));
    }
    totalsBox.replaceChildren(totals(a));
  };
  el.refresh(s);
  return el;
}

function personCard(store, p, i, verdictBoxes) {
  const set = (fn, structural = false) => store.update(fn, { structural });
  const upd = (key, val, structural) => set((x) => { x.household.people[i][key] = val; }, structural);
  const box = h('div', {});
  verdictBoxes.set(p.id, box);
  const incomeFields = [];
  if (p.incomeKind === 'salary') incomeFields.push(gaugeField({ compact: true, label: '年間の給与収入（額面）', value: p.revenue, max: 5_000_000, onChange: (v) => upd('revenue', v) }));
  if (p.incomeKind === 'pension') incomeFields.push(gaugeField({ compact: true, label: '年金の年間受取額（年金振込通知書・源泉徴収票の金額）', value: p.revenue, max: 5_000_000, onChange: (v) => upd('revenue', v), hint: '年金収入から所得への換算（公的年金等控除）の表は未登録のため、所得は確定できず「要確認」になります。' }));
  if (p.incomeKind === 'business') incomeFields.push(
    gaugeField({ compact: true, label: '年間の売上', value: p.revenue, max: 5_000_000, onChange: (v) => upd('revenue', v) }),
    gaugeField({ compact: true, label: '年間の経費（分からなければ0円。売上と利益のどちらでも判定できる場合があります）', value: p.expenses, max: 5_000_000, onChange: (v) => upd('expenses', v) }));
  if (p.incomeKind === 'other') incomeFields.push(gaugeField({ compact: true, label: '年間の所得金額（収入から経費などを引いた後の額）', value: p.revenue, max: 5_000_000, onChange: (v) => upd('revenue', v) }));

  const kindLabel = PERSON_KINDS[p.kind];
  return h('div', { class: 'item' },
    h('div', { class: 'item-head' }, h('strong', {}, `${kindLabel}${p.name ? `：${p.name}` : ''}（${p.age}歳）`),
      h('button', { type: 'button', class: 'btn danger', onClick: () => set((x) => { x.household.people.splice(i, 1); }, true) }, '削除')),
    box,
    h('details', { class: 'edit', open: p.supportedByMe === null || p.livesTogether === null }, h('summary', {}, '回答を編集する'),
    field('呼び名（メモ）', h('input', { type: 'text', value: p.name, maxlength: 100, placeholder: '例：母', onInput: (e) => upd('name', e.target.value) })),
    gaugeField({ compact: true, label: '年齢（12月31日時点）', value: p.age, max: 100, step: 1, unit: '歳', onChange: (v) => upd('age', Math.min(v, 120)) }),
    tri('同居していますか', p.livesTogether, (v) => upd('livesTogether', v)),
    tri(p.kind === 'spouse' ? '生活費をあなたが主に負担していますか（生計を一にしていますか）' : '生活費の大半をあなたが負担していますか（仕送りを含む）', p.supportedByMe, (v) => upd('supportedByMe', v)),
    field('収入の種類', select(INCOME_KINDS, p.incomeKind, (v) => upd('incomeKind', v, true))),
    ...incomeFields,
    field('障害者手帳などはありますか', select(CERTIFICATES, p.certificate, (v) => upd('certificate', v)),
      { hint: '手帳の等級で一般障害者・特別障害者が決まります（国税庁 No.1160）。透析をされている方は、身体障害者手帳（腎臓機能障害）の等級を確認してください。' }),
    checkbox('通院・入院などの医療費を払っている', p.medical, (v) => upd('medical', v))));
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
    mk('parent', { name: '父', age: 73, incomeKind: 'pension', revenue: 0 }),
    mk('child', { name: '子', age: 15 }),
    mk('child', { name: '子', age: 13 }),
  ];
}
