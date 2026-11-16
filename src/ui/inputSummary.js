// 「入力のまとめ」: 入力した内容を、日本語の一覧で見せる。スクロールしながら入力欄を見直さなくても、合っているか確かめられるようにする。
// 各行の「直す」で、入力画面の該当する場所へ移動する。計算はしない（入力値の表示だけ）。
import { h } from './dom.js';
import { formatYen } from '../core/money.js';
import { INSURANCE_TYPE, PENSION_TYPE, FILING_TYPE } from '../core/schema.js';
import { getIncomeCategory } from '../data/incomeCategories.js';
import { MANUAL_DEDUCTIONS, MANUAL_TAX_CREDITS } from '../data/deductions.js';

const yen = (v) => `${formatYen(v)}円`;
const plain = (label) => label.replace(/（.*?）/g, '');

// 手入力の控除・税額控除のうち、金額が入っているもの
function manualItems(state) {
  const out = [];
  const sumOf = (box) => Object.values(box || {}).reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0);
  for (const d of MANUAL_DEDUCTIONS.filter((x) => x.supported)) {
    const v = sumOf(state.deductions[d.id]);
    if (v > 0) out.push(`${plain(d.label)} ${yen(v)}`);
  }
  for (const d of MANUAL_TAX_CREDITS) {
    const v = sumOf(state.taxCredits[d.id]);
    if (v > 0) out.push(`${plain(d.label)} ${yen(v)}`);
  }
  return out;
}

export function summaryRows(state) {
  const rows = [];
  const pref = state.residence.prefecture;
  rows.push({ label: 'お住まい', value: pref || '未選択', miss: !pref, to: 'sec-settings' });
  rows.push({ label: '年齢', value: `${state.self.age}歳`, to: state.household.enabled ? 'sec-household' : 'sec-settings' });

  state.incomes.forEach((inc) => {
    const cat = getIncomeCategory(inc.category);
    const name = inc.name ? `（${inc.name}）` : '';
    const exp = cat && cat.hasExpenses && inc.expenses ? ` ／ 経費 ${yen(inc.expenses)}` : '';
    rows.push({ label: `${cat ? cat.label : inc.category}${name}`, value: `${yen(inc.amount)}${exp}`, miss: false, to: 'sec-incomes' });
  });
  if (state.incomes.some((i) => i.category === 'business')) {
    rows.push({ label: '申告方式', value: `${FILING_TYPE[state.filing.type] || ''}${state.filing.type === 'blue' ? `（特別控除 ${state.filing.blueDeduction}万円）` : ''}`, to: 'sec-settings' });
  }

  rows.push({ label: '健康保険', value: INSURANCE_TYPE[state.insurance.type] || '', to: 'sec-household' });
  if (state.insurance.type !== 'voluntary') {
    rows.push({ label: '年金', value: state.insurance.pension && state.insurance.pension !== 'auto' ? PENSION_TYPE[state.insurance.pension] : '健康保険に合わせる', to: 'sec-household' });
  }
  if (state.insurance.actualAnnual != null) rows.push({ label: '社会保険料', value: `${yen(state.insurance.actualAnnual)}（実額）`, to: 'sec-household' });

  rows.push({ label: '配偶者', value: state.spouse.exists ? `あり（${state.spouse.age}歳）` : 'なし', to: state.household.enabled ? 'sec-household' : 'sec-settings' });
  const deps = state.dependents;
  rows.push({ label: '扶養親族', value: deps.length ? `${deps.length}人（${deps.map((d) => `${d.age}歳`).join('・')}）` : 'なし', to: state.household.enabled ? 'sec-household' : 'sec-settings' });

  const items = manualItems(state);
  rows.push({ label: '手入力の控除', value: items.length ? items.join('、') : 'なし', step: 'adjust', to: 'sec-deductions' });
  return rows;
}

export function inputSummarySection(store) {
  const el = h('details', { class: 'card', id: 'sec-summary', open: true }, h('summary', {}, '入力のまとめ'));
  const body = h('div', { class: 'body' });
  el.append(body);
  let timer = null;

  const render = () => {
    const rows = summaryRows(store.get());
    body.replaceChildren(
      h('p', { class: 'hint' }, 'この内容で計算しています。違うところは「直す」を押してください。'),
      h('ul', { class: 'sum-list' }, rows.map((r) => h('li', { class: r.miss ? 'miss' : '' },
        h('span', { class: 'sum-label' }, r.label),
        h('span', { class: 'sum-value' }, r.value),
        h('button', { type: 'button', class: 'sum-edit', 'data-goto': r.step || 'input', 'data-scroll-to': r.to, 'aria-label': `${r.label}を直す` }, '直す')))));
  };
  el.refresh = () => { clearTimeout(timer); timer = setTimeout(render, 120); };
  render();
  return el;
}
