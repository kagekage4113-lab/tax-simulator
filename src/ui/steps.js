// 入力 → 確認 → 調整 の3段階を切り替える（画面内の切り替え。入力は消えず、オフラインでも動く）。
// panels: { input, review, adjust } の要素。classic が true のときは、切り替えずに全部を縦に並べる（従来の1ページ表示）。
import { h } from './dom.js';

export const STEPS = [
  { id: 'input', no: '1', label: '入力' },
  { id: 'review', no: '2', label: '確認' },
  { id: 'adjust', no: '3', label: '調整' },
];
const ids = STEPS.map((s) => s.id);
const fmt = (v) => (v == null ? '—' : `${v.toLocaleString('ja-JP')}円`);

export function createSteps({ panels, classic = false, win = window }) {
  let current = ids.includes(win.location.hash.slice(1)) ? win.location.hash.slice(1) : 'input';
  let isClassic = classic;
  const take = h('strong', { class: 'dk-take' }, '—');
  const burden = h('strong', { class: 'dk-burden' }, '—');
  const summary = h('button', { type: 'button', class: 'dk-summary', 'data-goto': 'review', 'aria-label': '確認の画面へ' },
    h('span', { class: 'dk-item' }, h('small', {}, '年間手取り'), take),
    h('span', { class: 'dk-item' }, h('small', {}, '年間負担合計'), burden));
  const badge = h('span', { class: 'dk-badge', hidden: true, 'aria-label': '未回答の項目' }, '0');
  const tabs = STEPS.map((s) => h('button', { type: 'button', class: 'dk-tab', role: 'tab', 'data-goto': s.id, id: `tab-${s.id}` },
    h('span', { class: 'dk-no' }, s.no), h('span', { class: 'dk-label' }, s.label), s.id === 'input' ? badge : null));
  const dock = h('nav', { class: 'dock', 'aria-label': '手順' }, summary, h('div', { class: 'dk-tabs', role: 'tablist' }, tabs));

  const render = () => {
    for (const id of ids) {
      const el = panels[id];
      el.hidden = isClassic ? false : id !== current;
      el.classList.toggle('step-panel', true);
    }
    tabs.forEach((t, i) => {
      const on = ids[i] === current;
      t.classList.toggle('on', on && !isClassic);
      t.setAttribute('aria-selected', String(on && !isClassic));
    });
    dock.classList.toggle('classic', isClassic);
  };
  const go = (id, { scroll = true } = {}) => {
    if (!ids.includes(id)) return;
    current = id;
    if (win.location.hash.slice(1) !== id) { try { win.history.replaceState(null, '', `#${id}`); } catch { /* 埋め込み表示では履歴を書き換えられない */ } }
    render();
    if (scroll) { try { win.scrollTo(0, 0); } catch { /* jsdom など */ } }
  };
  // どこにある data-goto ボタンでも、その段階へ移動する
  win.document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-goto]');
    if (t && ids.includes(t.dataset.goto)) go(t.dataset.goto);
  });
  win.addEventListener('hashchange', () => { const id = win.location.hash.slice(1); if (ids.includes(id) && id !== current) go(id); });
  render();

  return {
    dock,
    go,
    current: () => current,
    setClassic(v) { isClassic = !!v; render(); },
    isClassic: () => isClassic,
    setSummary(takeHome, b) { take.textContent = fmt(takeHome); burden.textContent = fmt(b); },
    setBadge(n) { badge.textContent = String(n); badge.hidden = !n; },
  };
}

// 段階の最後に置く「前へ／次へ」ボタン
export function stepNav({ back, next }) {
  return h('div', { class: 'step-nav' },
    back ? h('button', { type: 'button', class: 'btn', 'data-goto': back.id }, `← ${back.label}`) : h('span'),
    next ? h('button', { type: 'button', class: 'btn primary', 'data-goto': next.id }, `${next.label} →`) : null);
}
