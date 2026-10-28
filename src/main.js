import './style.css';
import { h } from './ui/dom.js';
import { createStore } from './core/store.js';
import { dataSection } from './ui/dataSection.js';
import { deductionsSection, incomesSection, resultSection, settingsSection } from './ui/sections.js';
import { simulationSection } from './ui/simulation.js';
import { householdSection } from './ui/household.js';
import { situationSection } from './ui/situation.js';
import { applyHousehold } from './interview/assess.js';
import { getTaxYear } from './data/taxYears/index.js';

const store = createStore();
const app = document.getElementById('app');

const status = h('span', { class: 'save-status', role: 'status' }, '');
const notice = store.notice ? h('p', { class: 'banner' }, store.notice) : null;
const result = resultSection();
const simulation = simulationSection(store);
const situation = situationSection(store);

// 結果が画面外にあるとき、手取りと負担の要約を下部に固定表示する（結果欄が見えている間は隠す）
const bar = h('button', { type: 'button', class: 'summary-bar', hidden: true, 'aria-label': '結果の欄へ移動' },
  h('span', { class: 'sb-item' }, h('small', {}, '年間手取り'), h('strong', { class: 'sb-take' }, '—')),
  h('span', { class: 'sb-item' }, h('small', {}, '年間負担合計'), h('strong', { class: 'sb-burden' }, '—')),
  h('span', { class: 'sb-go' }, '結果へ ▼'));
const fmt = (v) => (v == null ? '—' : `${v.toLocaleString('ja-JP')}円`);
result.onCalc = (r) => {
  bar.querySelector('.sb-take').textContent = fmt(r.takeHome);
  bar.querySelector('.sb-burden').textContent = fmt(r.burden);
};
bar.addEventListener('click', () => {
  result.open = true;
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => { bar.hidden = entry.isIntersecting; }).observe(result);
} else bar.hidden = false;

const dynamic = h('div', { class: 'dynamic' });
let household = null;
// 構造が変わる操作（追加・削除・選択肢による項目の出し分け）では開閉状態を保ったまま作り直す。
function rebuild() {
  const open = new Map([...document.querySelectorAll('details[id], details.sub')].map((d, i) => [d.id || `sub-${i}`, d.open]));
  const subOpen = [...document.querySelectorAll('details.sub')].map((d) => d.open);
  household = householdSection(store);
  dynamic.replaceChildren(household, settingsSection(store), incomesSection(store), deductionsSection(store));
  dynamic.querySelectorAll('details[id]').forEach((d) => { if (open.has(d.id)) d.open = open.get(d.id); });
  dynamic.querySelectorAll('details.sub').forEach((d, i) => { if (subOpen[i] !== undefined) d.open = subOpen[i]; });
}
rebuild();
result.update(store.get());

store.subscribe((state, e) => {
  if (e.type === 'saved') {
    status.textContent = e.saveOk ? '保存しました' : '保存できませんでした（JSONで書き出してください）';
    status.classList.toggle('error', !e.saveOk);
    return;
  }
  status.textContent = '保存中…';
  // かんたん入力（世帯）が有効なら、年度や収入の変更にも追随して、本人・配偶者・扶養親族を導き直す
  if (state.household.enabled) applyHousehold(state, getTaxYear(state.taxYear));
  if (e.structural) rebuild();
  else if (household) household.refresh(state);
  situation.refresh();
  result.update(state);
  simulation.update(state, e);
});

app.append(
  h('header', { class: 'top' },
    h('h1', {}, 'ざっくり手取り＆税金シミュレーター'),
    h('p', {}, '確定申告の代わりではなく、収入が変わったときの目安を知るためのツールです。'),
    h('details', { class: 'help' }, h('summary', {}, '使い方と注意'),
      h('ol', {},
        h('li', {}, '「年度・申告条件」で年度・お住まい・家族を入力します。'),
        h('li', {}, '「現在の収入と経費」に、収入の種類ごとに金額を入れます（スライダーか数字の直接入力）。'),
        h('li', {}, '保険料・医療費・寄附などがあれば「所得控除・税額控除」に入れます。'),
        h('li', {}, '「税金と手取りの結果」で目安を確認し、「変動シミュレーション」で「あと○円稼いだら？」を比べます。')),
      h('p', {}, '入力は、この端末のブラウザの中だけに保存され、外部へ送信されません。「データ保存・復元」でファイルに書き出せます。金額は概算の目安です。')),
    status),
  ...(notice ? [notice] : []),
  h('main', {}, dynamic, situation, result, simulation, dataSection(store)),
  bar,
  h('footer', {}, '入力内容は端末内にのみ保存され、外部へ送信されません。表示される金額は概算の目安です。'),
);

window.addEventListener('pagehide', () => store.flush());
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
