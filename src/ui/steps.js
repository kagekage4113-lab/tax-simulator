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
const fmtSigned = (v) => (v == null ? '' : `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toLocaleString('ja-JP')}`);
const DOCK_KEY = 'taxsim.dock';
const readDock = () => { try { return localStorage.getItem(DOCK_KEY); } catch { return null; } };
const writeDock = (v) => { try { localStorage.setItem(DOCK_KEY, v); } catch { /* 保存できなくても動く */ } };

// 数字を、前の値から新しい値へ短く数え上げて表示する（初めての表示・動きを減らす設定・同じ値のときは、すぐ表示）。
function countTo(win, el, to) {
  const from = el._shown;
  el._shown = to;
  if (el._raf && win.cancelAnimationFrame) win.cancelAnimationFrame(el._raf);
  const reduce = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (typeof from !== 'number' || typeof to !== 'number' || from === to || reduce || !win.requestAnimationFrame) { el.textContent = fmt(to); return; }
  let t0 = null; // 最初のフレームの時刻を起点にする（時刻の基準が環境で違っても動くように）
  const step = (t) => {
    if (t0 === null) t0 = t;
    const k = Math.max(0, Math.min(1, (t - t0) / 350));
    const v = Math.round(from + (to - from) * (1 - (1 - k) ** 3));
    el.textContent = fmt(k < 1 ? v : to);
    if (k < 1) el._raf = win.requestAnimationFrame(step); else el._raf = 0;
  };
  el._raf = win.requestAnimationFrame(step);
}

export function createSteps({ panels, classic = false, win = window }) {
  let current = ids.includes(win.location.hash.slice(1)) ? win.location.hash.slice(1) : 'input';
  let isClassic = classic;
  const take = h('strong', { class: 'dk-take' }, '—');
  const burden = h('strong', { class: 'dk-burden' }, '—');
  // 「いま」の行は常に出し、条件を変えて試しているときだけ「もし」の行を足す（2段表示）
  const takeIf = h('strong', { class: 'dk-take-if' }, '—');
  const burdenIf = h('strong', { class: 'dk-burden-if' }, '—');
  const takeDelta = h('small', { class: 'dk-delta' });
  const burdenDelta = h('small', { class: 'dk-delta' });
  const rowIf = h('span', { class: 'dk-row dk-if', hidden: true },
    h('span', { class: 'dk-tag' }, 'もし'),
    h('span', { class: 'dk-item' }, takeIf, takeDelta),
    h('span', { class: 'dk-item' }, burdenIf, burdenDelta));
  const summary = h('button', { type: 'button', class: 'dk-summary', 'data-goto': 'review', 'aria-label': '確認の画面へ' },
    h('span', { class: 'dk-row dk-head' }, h('span', { class: 'dk-tag' }), h('small', {}, '年間手取り'), h('small', {}, '年間負担合計')),
    h('span', { class: 'dk-row' }, h('span', { class: 'dk-tag' }, 'いま'), h('span', { class: 'dk-item' }, take), h('span', { class: 'dk-item' }, burden)),
    rowIf);
  const toggle = h('button', { type: 'button', class: 'dk-toggle', 'aria-expanded': 'true' }, '↓');
  const top = h('div', { class: 'dk-top' }, toggle, summary);
  let collapsed = readDock() === 'collapsed';
  let scenario = null;
  const badge = h('span', { class: 'dk-badge', hidden: true, 'aria-label': '未回答の項目' }, '0');
  const tabs = STEPS.map((s) => h('button', { type: 'button', class: 'dk-tab', role: 'tab', 'data-goto': s.id, id: `tab-${s.id}` },
    h('span', { class: 'dk-no' }, s.no), h('span', { class: 'dk-label' }, s.label), s.id === 'input' ? badge : null));
  const dock = h('nav', { class: 'dock', 'aria-label': '手順' }, top, h('div', { class: 'dk-tabs', role: 'tablist' }, tabs));

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
    // 条件を変えて試している間は、「調整」の画面（1ページ表示ではどこでも）で2段にする
    rowIf.hidden = !(scenario && (isClassic || current === 'adjust'));
    dock.classList.toggle('two-rows', !rowIf.hidden);
    dock.classList.toggle('collapsed', collapsed);
    toggle.textContent = collapsed ? '↑ 手取りを表示' : '↓';
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? '手取りの表示を開く' : '手取りの表示をたたむ');
  };
  toggle.addEventListener('click', () => { collapsed = !collapsed; writeDock(collapsed ? 'collapsed' : 'open'); render(); });
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
    setSummary(takeHome, b) { countTo(win, take, takeHome); countTo(win, burden, b); },
    // 条件を変えた場合の結果 { takeHome, burden, takeDelta, burdenDelta }。null で「もし」の行を消す
    setScenario(s) {
      scenario = s && s.takeHome != null && s.burden != null ? s : null;
      if (scenario) {
        countTo(win, takeIf, scenario.takeHome); countTo(win, burdenIf, scenario.burden);
        takeDelta.textContent = fmtSigned(scenario.takeDelta);
        takeDelta.className = `dk-delta ${scenario.takeDelta > 0 ? 'up' : scenario.takeDelta < 0 ? 'down' : ''}`;
        burdenDelta.textContent = fmtSigned(scenario.burdenDelta);
      }
      render();
    },
    setBadge(n) { badge.textContent = String(n); badge.hidden = !n; },
  };
}

// 段階の最後に置く「前へ／次へ」ボタン
export function stepNav({ back, next }) {
  return h('div', { class: 'step-nav' },
    back ? h('button', { type: 'button', class: 'btn', 'data-goto': back.id }, `← ${back.label}`) : h('span'),
    next ? h('button', { type: 'button', class: 'btn primary', 'data-goto': next.id }, `${next.label} →`) : null);
}
