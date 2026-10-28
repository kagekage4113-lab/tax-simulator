import './style.css';
import { h } from './ui/dom.js';
import { createStore } from './core/store.js';
import { dataSection } from './ui/dataSection.js';
import { deductionsSection, incomesSection, resultSection, settingsSection } from './ui/sections.js';
import { simulationSection } from './ui/simulation.js';
import { householdInputSection, householdReviewSection } from './ui/household.js';
import { situationSection } from './ui/situation.js';
import { cushionSection } from './ui/cushion.js';
import { scopeSection } from './ui/scope.js';
import { createSteps, stepNav, STEPS } from './ui/steps.js';
import { applyHousehold, missingFacts } from './interview/assess.js';
import { DEFAULT_YEAR, UI_YEARS, rulesOf, yearLabel } from './data/taxYears/index.js';

// 配色: 自動（端末の設定に合わせる）／ライト／ダーク。選んだものはこの端末に覚えておく。
const THEME_KEY = 'taxsim.theme';
const readTheme = () => { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch { return 'auto'; } };
const applyTheme = (mode) => {
  if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode; else delete document.documentElement.dataset.theme;
  try { localStorage.setItem(THEME_KEY, mode); } catch { /* 保存できなくても動く */ }
  document.dispatchEvent(new Event('themechange'));
};
const systemDark = () => !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
const isDark = () => (readTheme() === 'dark' ? true : readTheme() === 'light' ? false : systemDark());
applyTheme(readTheme());

const store = createStore();
const app = document.getElementById('app');

// 画面が対応する年（令和8年分）以外の保存データは、令和8年分として読み込む（税制データがないため、年だけ付け替える）
let yearNotice = null;
if (!UI_YEARS.includes(store.get().taxYear)) {
  const old = store.get().taxYear;
  store.update((x) => { x.taxYear = DEFAULT_YEAR; });
  yearNotice = `${yearLabel(old)}の保存データを、${yearLabel(DEFAULT_YEAR)}として読み込みました。税額は${yearLabel(DEFAULT_YEAR)}の制度で計算し直されます。`;
}

const status = h('span', { class: 'save-status', role: 'status' }, '');
const notice = store.notice || yearNotice ? h('p', { class: 'banner' }, [store.notice, yearNotice].filter(Boolean).join(' ')) : null;
const result = resultSection();
const simulation = simulationSection(store);
const situation = situationSection(store);
const cushion = cushionSection(store);

// 従来の1ページ表示（全部を縦に並べる）。選択は端末に覚えておく。
const VIEW_KEY = 'taxsim.view';
const readView = () => { try { return localStorage.getItem(VIEW_KEY); } catch { return null; } };
const writeView = (v) => { try { localStorage.setItem(VIEW_KEY, v); } catch { /* 保存できなくても動く */ } };
const classicAtStart = new URLSearchParams(location.search).get('view') === 'classic' || readView() === 'classic';

// 構造が変わる操作（追加・削除・選択肢による項目の出し分け）で作り直す入力欄の置き場
const slots = { basics: h('div'), incomes: h('div'), household: h('div'), review: h('div'), deductions: h('div') };
let hhInput = null;
let hhReview = null;
// 作り直しても、開閉状態は保つ
function rebuild() {
  const open = new Map([...document.querySelectorAll('details[id]')].map((d) => [d.id, d.open]));
  const subOpen = [...document.querySelectorAll('details.sub')].map((d) => d.open);
  hhInput = householdInputSection(store);
  hhReview = householdReviewSection(store);
  slots.basics.replaceChildren(settingsSection(store));
  slots.incomes.replaceChildren(incomesSection(store));
  slots.household.replaceChildren(hhInput);
  slots.review.replaceChildren(hhReview);
  slots.deductions.replaceChildren(deductionsSection(store));
  for (const slot of Object.values(slots)) {
    slot.querySelectorAll('details[id]').forEach((d) => { if (open.has(d.id)) d.open = open.get(d.id); });
    slot.querySelectorAll('details.sub').forEach((d, i) => { if (subOpen[i] !== undefined) d.open = subOpen[i]; });
  }
}
rebuild();

const next = (id) => STEPS.find((s) => s.id === id);
const panels = {
  input: h('section', { class: 'step', id: 'step-input', 'aria-labelledby': 'tab-input' },
    h('p', { class: 'step-lead' }, 'まず、わかる範囲で入力してください。住んでいる場所・収入・家族・年齢が中心です。控除の細かい項目は「調整」であとから入れられます。'),
    slots.basics, slots.incomes, slots.household,
    stepNav({ next: { id: 'review', label: '確認へ進む' } })),
  review: h('section', { class: 'step', id: 'step-review', 'aria-labelledby': 'tab-review' },
    h('p', { class: 'step-lead' }, '入力から出た、税金と手取りの目安です。赤い項目や「要確認」は、「入力」に戻って答えると確定します。'),
    result, cushion, slots.review, situation,
    stepNav({ back: next('input'), next: { id: 'adjust', label: '調整へ進む' } })),
  adjust: h('section', { class: 'step', id: 'step-adjust', 'aria-labelledby': 'tab-adjust' },
    h('p', { class: 'step-lead' }, '条件を変えて試したり、分かる控除を足して精度を上げたりできます。結果は「確認」で見られます。'),
    simulation, slots.deductions, dataSection(store),
    stepNav({ back: next('review') })),
};
const steps = createSteps({ panels, classic: classicAtStart });

result.onCalc = (r) => steps.setSummary(r.takeHome, r.burden);
simulation.onScenario = (s) => steps.setScenario(s);
const refreshBadge = (state) => steps.setBadge(state.household.enabled ? missingFacts(state).length : 0);
result.update(store.get());
refreshBadge(store.get());

store.subscribe((state, e) => {
  if (e.type === 'saved') {
    status.textContent = e.saveOk ? '保存しました' : '保存できませんでした（「調整」のバックアップ保存をご利用ください）';
    status.classList.toggle('error', !e.saveOk);
    return;
  }
  status.textContent = '保存中…';
  // かんたん入力（世帯）が有効なら、年度や収入の変更にも追随して、本人・配偶者・扶養親族を導き直す
  if (state.household.enabled) applyHousehold(state, rulesOf(state));
  if (e.structural) rebuild();
  else { hhInput.refresh(state); hhReview.refresh(state); }
  situation.refresh();
  cushion.refresh();
  result.update(state);
  simulation.update(state, e);
  refreshBadge(state);
});

// ワンタップで ライト⇄ダーク（押した時点の見た目の反対に切り替える）。「自動」に戻すのは下の配色の欄から。
function themeButton() {
  const b = h('button', { type: 'button', class: 'theme-btn', onClick: () => applyTheme(isDark() ? 'light' : 'dark') });
  const sync = () => { b.textContent = isDark() ? '☀ ライト表示にする' : '☾ ダーク表示にする'; };
  document.addEventListener('themechange', sync);
  if (window.matchMedia) { try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync); } catch { /* 古い環境 */ } }
  sync();
  return b;
}
function themeSwitch() {
  const wrap = h('span', { class: 'theme-switch', role: 'group', 'aria-label': '配色' }, h('span', {}, '配色：'));
  const buttons = [['auto', '自動'], ['light', 'ライト'], ['dark', 'ダーク']].map(([mode, label]) => h('button', { type: 'button', 'aria-pressed': 'false', onClick: () => { applyTheme(mode); sync(); } }, label));
  const modes = ['auto', 'light', 'dark'];
  const sync = () => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(modes[i] === readTheme())));
  document.addEventListener('themechange', sync);
  wrap.append(...buttons);
  sync();
  return wrap;
}
const viewToggle = h('button', { type: 'button', class: 'linklike' }, '');
const syncToggle = () => { viewToggle.textContent = steps.isClassic() ? '3段階表示（入力→確認→調整）に戻す' : '1ページにまとめて表示する'; };
viewToggle.addEventListener('click', () => { steps.setClassic(!steps.isClassic()); writeView(steps.isClassic() ? 'classic' : 'steps'); syncToggle(); });
syncToggle();

app.append(
  h('header', { class: 'top' },
    h('div', { class: 'top-tools' }, themeButton()),
    h('h1', {}, 'ざっくり手取り＆税金シミュレーター', ' ', h('span', { class: 'badge warn' }, 'ベータ版')),
    h('p', {}, '確定申告の代わりではなく、収入が変わったときの目安を知るためのツールです。'),
    scopeSection(),
    h('details', { class: 'help' }, h('summary', {}, '使い方と注意'),
      h('ol', {},
        h('li', {}, h('strong', {}, '①入力'), ': 住んでいる場所・収入・家族・年齢を入れます（スライダーか数字の直接入力）。赤い欄はまだ答えていない項目です。'),
        h('li', {}, h('strong', {}, '②確認'), ': 税金と手取りの目安、世帯の見取り図（誰が非課税か）、控除の判定と理由、あとどこまで余裕があるかを見ます。'),
        h('li', {}, h('strong', {}, '③調整'), ': 「あと○円稼いだら？」などを試したり、保険料・医療費・寄附などの控除を足して精度を上げたりします。')),
      h('p', {}, '入力は、この端末のブラウザの中だけに保存され、外部へ送信されません。「調整」の下にある「データの保存・読み込み」で、バックアップを残せます。金額は概算の目安です。')),
    status),
  ...(notice ? [notice] : []),
  steps.dock, // スマホでは下に固定、PCでは上に固定（CSSで切り替え）
  h('main', {}, panels.input, panels.review, panels.adjust),
  h('footer', {}, themeSwitch(), h('br'), '入力内容は端末内にのみ保存され、外部へ送信されません。表示される金額は概算の目安です。', h('br'), '【ご利用にあたって】この内容は2026年10月時点の公的資料に基づく参考情報です。正確性・最新性を保証するものではなく、利用によって生じた損害について責任を負いません。申告や手続きは、国税庁・自治体・専門家の案内をご確認ください。', h('br'), h('a', { href: 'https://github.com/kagekage4113-lab/tax-simulator', target: '_blank', rel: 'noopener' }, '使い方・限界・不具合の連絡（GitHub）'), h('br'), viewToggle, ' ／ ', h('button', { type: 'button', class: 'linklike', 'data-goto': 'adjust' }, 'データの保存・読み込みへ')),
);

window.addEventListener('pagehide', () => store.flush());
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
