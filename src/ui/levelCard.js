// 「いまの位置と、次のレベル」: ①〜④の計算の流れ、いまと次の税率区分、控除を増やしたときの得を、短く並べる。
// 計算はエンジン（calc/level.js）の結果を読むだけ。難しい説明は、ここには置かない。
import { h } from './dom.js';
import { formatYen } from '../core/money.js';
import { calculate } from '../calc/engine.js';
import { levelInfo, savingByDeduction } from '../calc/level.js';
import { scenarioState } from '../interview/assess.js';
import { rulesOf } from '../data/taxYears/index.js';

const yen = (v) => (v == null ? '—' : `${formatYen(v)}円`);
const man = (n) => (n >= 10_000 ? `${Math.round(n / 1000) / 10}万円` : `${formatYen(n)}円`);
const pct = (r) => (r == null ? '—' : `${Math.round(r * 1000) / 10}%`);
const SAVE_STEPS = [100_000, 300_000, 500_000];

export function levelSection(store, rulesFor = rulesOf) {
  const el = h('details', { class: 'card', id: 'sec-level', open: true }, h('summary', {}, 'いまの位置と、次のレベル'));
  const body = h('div', { class: 'body' });
  el.append(body);
  let timer = null;

  const render = () => {
    const state = store.get();
    const rules = rulesFor(state);
    if (!rules) { body.replaceChildren(); return; }
    const base = state.household.enabled ? scenarioState(state, rules, 'confirmed') : state;
    const r = calculate(base, rules);
    const L = levelInfo(base, rules, r);
    if (!L || r.incomeTax?.total == null || r.residentTax?.total == null) {
      body.replaceChildren(h('p', { class: 'hint' }, '入力が足りないか、税制データが未登録のため、まだ表示できません。'));
      return;
    }

    // ①〜④: 所得 − 引ける控除 ＝ 課税される所得 × 税率 ＝ 税額
    const i = r.income;
    const incomeNet = i.comprehensive + i.fx.income + i.listed.income;
    const tIT = r.taxable.incomeTax; const tRT = r.taxable.residentTax;
    const takeIT = tIT.comprehensive + tIT.fx + tIT.listed;
    const takeRT = tRT.comprehensive + tRT.fx + tRT.listed;
    const row = (label, a, b, cls = '') => h('tr', { class: cls }, h('th', {}, label), h('td', { class: 'r' }, a), h('td', { class: 'r' }, b));
    const flow = h('div', { class: 'lv-block' },
      h('h3', {}, '税金はこう決まる'),
      h('table', { class: 'tbl lv-flow' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, '所得税'), h('th', {}, '住民税'))),
        h('tbody', {},
          row('① 所得', yen(incomeNet), yen(incomeNet)),
          row('② 引ける控除', `−${yen(incomeNet - takeIT)}`, `−${yen(incomeNet - takeRT)}`),
          row('③ 課税される所得', yen(takeIT), yen(takeRT), 'strong'),
          row('④ 税率', L.untaxed ? '—' : pct(L.rate), pct(L.residentRate)),
          row('＝ 税額（年）', yen(r.incomeTax.total), yen(r.residentTax.total), 'strong cushion-row'))),
      h('p', { class: 'hint' }, '① 収入から経費などを引いた額 ／ ② 基礎控除・社会保険料などの控除 ／ ③ ①−② ／ ④ 所得税は所得が増えるほど上がる（5〜45%）、住民税は一律。③ × ④ が税額のもとで、税額には復興特別税・均等割を含みます。'));

    // いま ／ 次のレベル
    const nextText = L.untaxed
      ? `いまは所得税がかからない範囲です。課税が始まるまで、あと${man(L.toNext)}（控除の余り）。`
      : L.top ? 'これより上の区分はありません。'
        : `次のレベルまで、課税される所得があと ${man(L.toNext)}。超えた分にだけ高い税率がかかります（全体にはかかりません）。`;
    const level = h('div', { class: 'lv-block' },
      h('h3', {}, 'いま ／ 次のレベル'),
      h('table', { class: 'tbl lv-level' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'いま'), h('th', {}, '次のレベル'))),
        h('tbody', {},
          row('課税される所得', yen(L.taxable), L.nextRate == null ? '—' : `${man(L.nextThreshold)}超`),
          row('所得税の税率', pct(L.rate), pct(L.nextRate)),
          row('住民税の税率', pct(L.residentRate), L.nextRate == null ? '—' : pct(L.residentRate)),
          row('所得が1万円増えると、税金は', `＋${yen(L.nowPerMan)}`, L.nextPerMan == null ? '—' : `＋${yen(L.nextPerMan)}`, 'strong'))),
      h('p', { class: 'hint' }, nextText, ' 社会保険料は含みません。'));

    // 控除を増やすと、いくら得？
    const saves = SAVE_STEPS.map((a) => savingByDeduction(base, rules, a));
    const save = h('div', { class: 'lv-block' },
      h('h3', {}, '控除を増やすと、いくら得？'),
      h('table', { class: 'tbl lv-save' }, h('tbody', {}, saves.map((s, k) => s && h('tr', { class: 'lv-save-row' },
        h('th', {}, `控除が ${man(SAVE_STEPS[k])} 増えると`),
        h('td', { class: 'r' }, s.total > 0 ? `−${yen(s.total)}` : '変わらない',
          s.total > 0 ? h('small', {}, `所得税${formatYen(s.incomeTax)}＋住民税${formatYen(s.residentTax)}`) : null))))),
      h('p', { class: 'hint' }, 'iDeCo・生命保険・地震保険・医療費など、所得から引く控除が増えたときの税金の目安です。ふるさと納税は別の仕組みです。'));

    body.replaceChildren(flow, level, save);
  };

  el.refresh = () => { clearTimeout(timer); timer = setTimeout(render, 120); };
  render();
  return el;
}
