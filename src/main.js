import './style.css';
import { h } from './ui/dom.js';
import { createStore } from './core/store.js';
import { dataSection } from './ui/dataSection.js';
import { deductionsSection, incomesSection, resultSection, settingsSection, simulationSection } from './ui/sections.js';

const store = createStore();
const app = document.getElementById('app');

const status = h('span', { class: 'save-status', role: 'status' }, '');
const notice = store.notice ? h('p', { class: 'banner' }, store.notice) : null;
const result = resultSection();

const dynamic = h('div', { class: 'dynamic' });
// 構造が変わる操作（追加・削除・選択肢による項目の出し分け）では開閉状態を保ったまま作り直す。
function rebuild() {
  const open = new Map([...document.querySelectorAll('details[id], details.sub')].map((d, i) => [d.id || `sub-${i}`, d.open]));
  const subOpen = [...document.querySelectorAll('details.sub')].map((d) => d.open);
  dynamic.replaceChildren(settingsSection(store), incomesSection(store), deductionsSection(store));
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
  if (e.structural) rebuild();
  result.update(state);
});

app.append(
  h('header', { class: 'top' },
    h('h1', {}, 'ざっくり手取り＆税金シミュレーター'),
    h('p', {}, '確定申告の代わりではなく、収入が変わったときの目安を知るためのツールです。'),
    status),
  ...(notice ? [notice] : []),
  h('main', {}, dynamic, result, simulationSection(), dataSection(store)),
  h('footer', {}, '入力内容は端末内にのみ保存され、外部へ送信されません。表示される金額は概算の目安です。'),
);

window.addEventListener('pagehide', () => store.flush());
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
