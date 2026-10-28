// 「控除と余裕（クッション）」: どの控除がいくらあるか（基礎控除を含む）を所得税・住民税で並べ、所得に対して控除がどれだけ余っているかを見せる。
// 計算はエンジンの結果（deductions / taxable）をそのまま読む。ここは表示だけ。
import { h } from './dom.js';
import { formatYen } from '../core/money.js';
import { calculate } from '../calc/engine.js';
import { situation } from '../calc/situation.js';
import { scenarioState } from '../interview/assess.js';
import { rulesOf } from '../data/taxYears/index.js';

const yen = (v) => (v == null ? '—' : `${formatYen(v)}円`);
const man = (n) => (n >= 10_000 ? `${Math.round(n / 1000) / 10}万円` : `${formatYen(n)}円`);
const COLORS = 6; // CSS の --seg-1 〜 --seg-6 を使い回す

// 控除の内訳（金額が0円でないもの）。所得税・住民税の両方に出る項目を同じ行にまとめる。
function itemRows(r) {
  const rows = new Map();
  for (const kind of ['incomeTax', 'residentTax']) {
    for (const it of r.deductions[kind].items) {
      if (!it.amount) continue;
      const row = rows.get(it.id) || { id: it.id, label: it.label.replace(/（.*?）/g, ''), incomeTax: 0, residentTax: 0 };
      row[kind] = it.amount;
      rows.set(it.id, row);
    }
  }
  return [...rows.values()];
}

// 横棒: 所得（上）と控除（下、内訳ごとに色分け）。目盛りは両方の大きいほうに揃える。
function bars(incomeParts, ded, rows, kind) {
  const income = incomeParts.reduce((a, p) => a + p.value, 0);
  const total = ded;
  const scale = Math.max(income, total, 1);
  const seg = (v, cls, title) => h('span', { class: `seg ${cls}`, style: `width:${(v / scale) * 100}%`, title }, '');
  const dedSegs = rows.filter((x) => x[kind] > 0).map((x, i) => seg(x[kind], `c${(i % COLORS) + 1}`, `${x.label} ${yen(x[kind])}`));
  return h('div', { class: 'cushion-bars' },
    h('div', { class: 'bar-row' }, h('span', { class: 'bar-label' }, '所得'),
      h('div', { class: 'bar' }, ...incomeParts.filter((p) => p.value > 0).map((p) => seg(p.value, p.cls, `${p.label} ${yen(p.value)}`)))),
    h('div', { class: 'bar-row' }, h('span', { class: 'bar-label' }, '控除'), h('div', { class: 'bar' }, ...dedSegs)));
}

export function cushionSection(store, rulesFor = rulesOf) {
  const el = h('details', { class: 'card', id: 'sec-cushion', open: true }, h('summary', {}, '控除と余裕（クッション）'));
  const body = h('div', { class: 'body' });
  el.append(body);
  let timer = null;

  const render = () => {
    const state = store.get();
    const rules = rulesFor(state);
    if (!rules) { body.replaceChildren(h('p', { class: 'warn' }, 'この年度の税制データが未登録のため、計算できません。')); return; }
    const base = state.household.enabled ? scenarioState(state, rules, 'confirmed') : state;
    const r = calculate(base, rules);
    if (r.takeHome === null || !r.taxable.incomeTax || !r.taxable.residentTax) {
      body.replaceChildren(h('p', { class: 'warn' }, '税制データまたは入力（任意継続の保険料など）が足りず、まだ確定できません。結果の欄の表示を確認してください。'));
      return;
    }
    const rows = itemRows(r);
    const i = r.income;
    const parts = [
      { label: '総合課税の所得', value: i.comprehensive, cls: 'inc1' },
      { label: 'FX・先物の所得', value: i.fx.income, cls: 'inc2' },
      { label: '上場株式等の所得', value: i.listed.income, cls: 'inc3' },
    ];
    const incomeNet = parts.reduce((a, p) => a + p.value, 0);
    const tIT = r.taxable.incomeTax; const tRT = r.taxable.residentTax;
    const dIT = r.deductions.incomeTax.total; const dRT = r.deductions.residentTax.total;
    const table = h('table', { class: 'tbl cushion-tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, '所得税'), h('th', {}, '住民税'))),
      h('tbody', {},
        h('tr', { class: 'sub-head' }, h('th', {}, '所得（分離課税を含む）'), h('td', { class: 'r' }, yen(incomeNet)), h('td', { class: 'r' }, yen(incomeNet))),
        ...rows.map((x, k) => h('tr', { class: x.id === 'basic' ? 'basic' : '' },
          h('th', {}, h('span', { class: `dot c${(k % COLORS) + 1}` }), x.label),
          h('td', { class: 'r' }, x.incomeTax ? yen(x.incomeTax) : '—'),
          h('td', { class: 'r' }, x.residentTax ? yen(x.residentTax) : '—'))),
        h('tr', { class: 'strong' }, h('th', {}, '控除の合計'), h('td', { class: 'r' }, yen(dIT)), h('td', { class: 'r' }, yen(dRT))),
        h('tr', {}, h('th', {}, '課税される所得'), h('td', { class: 'r' }, yen(tIT.comprehensive + tIT.fx + tIT.listed)), h('td', { class: 'r' }, yen(tRT.comprehensive + tRT.fx + tRT.listed))),
        h('tr', { class: 'strong cushion-row' }, h('th', {}, '控除の余り（クッション）'), h('td', { class: 'r' }, yen(tIT.unusedDeduction)), h('td', { class: 'r' }, yen(tRT.unusedDeduction)))));

    // いまの控除のまま、利益があと何円増えても税額0円か（基礎控除の段差を含めてエンジンで求める）
    const sit = situation(base, rules, 'fx');
    const m = (id) => sit.marks.find((x) => x.id === id);
    const line = (mark, text) => (mark && !mark.never && !mark.already ? h('li', {}, `${text}: あと${man(mark.margin)}まで`) : mark && mark.already ? h('li', {}, `${text}: すでに税額が出ています`) : null);

    // 基礎控除の段差（合計所得が増えると基礎控除が下がる）
    const steps = rules.basicDeduction?.incomeTax;
    let stepNote = null;
    if (steps && i.total != null) {
      const idx = steps.findIndex((s) => s.upTo == null || i.total <= s.upTo);
      const cur = steps[idx]; const nxt = steps[idx + 1];
      if (cur && nxt && cur.upTo != null) stepNote = h('p', { class: 'hint' }, `基礎控除（所得税）は、合計所得が${man(cur.upTo)}を超えると${man(cur.amount)}から${man(nxt.amount)}に下がります（いまの合計所得${man(i.total)}、あと${man(cur.upTo - i.total)}）。余裕の「あと○円」は、この段差も含めて計算しています。`);
    }

    // 要確認がすべて当てはまった場合の控除（世帯の入力があるときだけ）
    let maybe = null;
    if (state.household.enabled) {
      const ro = calculate(scenarioState(state, rules, 'optimistic'), rules);
      const dMax = ro.deductions.incomeTax.total;
      if (dMax != null && dIT != null && dMax > dIT) maybe = h('p', { class: 'hint' }, `要確認がすべて当てはまれば、所得税の控除は ${yen(dMax)}（今より ${yen(dMax - dIT)} 増える）になります。`);
    }

    body.replaceChildren(
      h('div', { class: 'cushion-head' },
        h('p', { class: 'key-line' }, tIT.unusedDeduction > 0 ? `所得税側で、控除が ${yen(tIT.unusedDeduction)} 余っています` : '所得税側に、控除の余りはありません（課税される所得があります）'),
        h('ul', { class: 'cushion-list' }, line(m('incomeTax'), '所得税が0円のまま'), line(m('residentLevy'), '住民税の所得割が0円のまま'))),
      bars(parts, dIT ?? 0, rows, 'incomeTax'),
      h('p', { class: 'hint' }, '棒は所得税の場合です（上が所得、下が控除の内訳）。'),
      table, stepNote, maybe,
      h('p', { class: 'hint' }, '控除が所得より大きい分は、分離課税のFX・上場株式等の所得から引かれます。社会保険料控除は、入力した（または概算の）社会保険料です。'));
  };

  el.refresh = () => { clearTimeout(timer); timer = setTimeout(render, 120); };
  render();
  return el;
}
