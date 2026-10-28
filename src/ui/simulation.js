// 収入・経費のシミュレーション画面（フェーズ3）。現在の入力は変更せず、複製した状態で再計算して比較する。
import { h, field, select } from './dom.js';
import { gaugeField } from './gaugeField.js';
import { missingLabel } from './sections.js';
import { compareExpense, compareIncome, fxTiming, sweepIncome } from '../calc/simulate.js';
import { UNSUPPORTED_WALLS } from '../calc/walls.js';
import { INCOME_CATEGORIES, getIncomeCategory } from '../data/incomeCategories.js';
import { rulesOf } from '../data/taxYears/index.js';
import { formatYen } from '../core/money.js';

const yen = (v) => (v == null ? '—' : `${formatYen(v)}円`);
// 比較表は幅が狭いので「円」を付けず、見出しで単位を示す
const num = (v) => (v == null ? '—' : formatYen(v));
const snum = (v) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatYen(Math.abs(v))}`);
const signed = (v) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatYen(Math.abs(v))}円`);
const pct = (v) => (v == null ? '—' : `${(Math.round(v * 10) / 10).toFixed(1)}%`);
const NEW_CATEGORIES = ['salary', 'business', 'realEstate', 'misc', 'fx', 'listedStock'];

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

const parseTarget = (v) => (v.startsWith('id:') ? { id: v.slice(3) } : { category: v.slice(4) });

function targetOptions(state, { existingOnly = false, expensesOnly = false } = {}) {
  const opts = {};
  for (const i of state.incomes) {
    const c = getIncomeCategory(i.category);
    if (expensesOnly && !c.hasExpenses) continue;
    opts[`id:${i.id}`] = `${i.name || c.label}（現在 ${formatYen(i.amount)}円）`;
  }
  if (!existingOnly) {
    for (const id of NEW_CATEGORIES) {
      const c = INCOME_CATEGORIES.find((x) => x.id === id);
      opts[`new:${id}`] = `＋ 新しい収入：${c.label}`;
    }
  }
  return opts;
}

// replaceChildren は null を文字列にしてしまうため、空の要素を除いて差し替える
const setChildren = (el, ...nodes) => el.replaceChildren(...nodes.flat().filter(Boolean));

const pickTarget = (current, opts, prefer) => (current && current in opts ? current : prefer.find((k) => k in opts) || Object.keys(opts)[0] || null);

export function simulationSection(store, rulesFor = rulesOf) {
  const ui = { touched: { A: false, B: false }, aTarget: null, aAdd: 500_000, aExp: 0, bTarget: null, bAmount: 200_000, bDir: 'up', cTarget: null, cMax: 3_000_000, fxUnreal: 1_000_000, fxRealize: 0 };
  let state = store.get();
  let timer = null;
  const panels = [];

  const panel = (title, id, build) => {
    const controls = h('div', { class: 'sim-controls' });
    const output = h('div', { class: 'sim-output', 'aria-live': 'polite' });
    const el = h('details', { class: 'sub sim-panel', id }, h('summary', {}, title), controls, output);
    const p = { el, controls, output, build, render: null };
    el.addEventListener('toggle', () => { if (el.open) p.render(); else if (p.onClose) p.onClose(); });
    panels.push(p);
    return p;
  };
  // 条件を変えた場合の結果を、画面下の要約（2段表示）に知らせる。画面を閉じる・条件が0のときは null
  const notify = (source, s) => {
    if (s) lastSource = source;
    else if (lastSource === source) lastSource = null;
    else return;
    if (el.onScenario) el.onScenario(s);
  };
  let lastSource = null;
  const scenarioOf = (c) => ({ takeHome: c.ma.takeHome, burden: c.ma.burden, takeDelta: c.diff.takeHome, burdenDelta: c.diff.burden });
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => panels.forEach((p) => p.el.open && p.render()), 90);
  };
  const missingNote = (missing) => (missing && missing.length
    ? h('p', { class: 'warn' }, `税制データが未登録のため、比較できない項目があります：${[...new Set(missing.map(missingLabel))].join('、')}`) : null);
  const notesList = (notes) => (notes && notes.length ? h('details', { class: 'sub' }, h('summary', {}, '計算の前提'), h('ul', { class: 'status-list' }, notes.map((n) => h('li', {}, n)))) : null);
  const cmpTable = (mb, ma, diff, hasBusinessTax) => h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl cmp' },
    h('thead', {}, h('tr', {}, h('th', {}, '（円）'), h('th', {}, '変更前'), h('th', {}, '変更後'), h('th', {}, '増減'))),
    h('tbody', {}, [
      ['収入', 'revenue'], ['所得（合計）', 'income'], ['所得税', 'incomeTax'], ['住民税', 'residentTax'],
      ...(hasBusinessTax ? [['個人事業税', 'businessTax']] : []), ['社会保険料', 'socialInsurance'],
      ['負担合計', 'burden', true], ['手取り', 'takeHome', true],
    ].map(([label, k, strong]) => h('tr', { class: strong ? 'strong' : '' }, h('th', {}, label), h('td', { class: 'r' }, num(mb[k])), h('td', { class: 'r' }, num(ma[k])), h('td', { class: 'r' }, snum(diff[k])))))));

  // ---- A. 追加収入 ----
  const A = panel('あと○円稼いだら？（追加収入の比較・限界負担率）', 'sim-income', null);
  A.build = () => {
    const opts = targetOptions(state);
    ui.aTarget = pickTarget(ui.aTarget, opts, ['new:misc']);
    setChildren(A.controls, 
      field('どの収入が増える？', select(opts, ui.aTarget, (v) => { ui.aTarget = v; ui.touched.A = true; schedule(); })),
      gaugeField({ label: '追加収入（売上・収入ベース）', value: ui.aAdd, max: 5_000_000, onChange: (v) => { ui.aAdd = v; ui.touched.A = true; schedule(); }, hint: '事業・不動産・雑所得は売上の増加額、FX・先物は利益の増加額、給与は収入（額面）の増加額です。' }),
      gaugeField({ label: '追加でかかる経費（任意）', value: ui.aExp, max: 2_000_000, onChange: (v) => { ui.aExp = v; ui.touched.A = true; schedule(); }, hint: '経費がかかる区分（事業・不動産・雑所得・暗号資産・FX）だけに反映されます。' }));
  };
  A.render = () => {
    if (!ui.aTarget) { notify('A', null); return setChildren(A.output, h('p', { class: 'note' }, '収入を追加すると比較できます。')); }
    const rules = rulesFor(state);
    const c = compareIncome(state, rules, { target: parseTarget(ui.aTarget), add: ui.aAdd, extraExpenses: ui.aExp });
    if (!c.available) { notify('A', null); return setChildren(A.output, missingNote(c.missing) || h('p', { class: 'warn' }, '現在の入力では比較できません。')); }
    notify('A', ui.touched.A && (ui.aAdd > 0 || ui.aExp > 0) ? scenarioOf(c) : null); // 触るまでは、初期表示の例では2段にしない
    const added = c.diff.income;
    setChildren(A.output, 
      h('div', { class: 'hero' },
        h('p', { class: 'hero-label' }, '追加収入に対する限界負担率'),
        h('p', { class: 'hero-num' }, c.marginalRate === null ? '追加収入が0円のため計算しません' : pct(c.marginalRate)),
        h('p', { class: 'hint' }, c.marginalRate === null ? '' : `追加収入 ${formatYen(ui.aAdd)}円のうち、税金・社会保険料が ${formatYen(c.diff.burden)}円増え、手取りは ${formatYen(c.diff.takeHome)}円増えます。（限界負担率 ＝ 追加負担額 ÷ 追加収入額）`)),
      added !== ui.aAdd ? h('p', { class: 'note' }, `所得の増加は ${signed(added)}（経費や給与所得控除などを差し引いた額）です。`) : null,
      cmpTable(c.mb, c.ma, c.diff, state.incomes.some((i) => i.category === 'business' && i.businessType !== 'unknown') || c.ma.businessTax > 0),
      notesList(c.notes));
  };

  // ---- B. 経費 ----
  const B = panel('経費を変えたら？（税負担の減少と実際の支出）', 'sim-expense', null);
  B.build = () => {
    const opts = targetOptions(state, { existingOnly: true, expensesOnly: true });
    ui.bTarget = pickTarget(ui.bTarget, opts, []);
    if (!ui.bTarget) return setChildren(B.controls, h('p', { class: 'note' }, '経費を入力できる収入（事業・不動産・雑所得・暗号資産・FX）がありません。'));
    setChildren(B.controls, 
      field('どの収入の経費？', select(opts, ui.bTarget, (v) => { ui.bTarget = v; ui.touched.B = true; schedule(); })),
      field('変更', select({ up: '経費を増やす（支出する）', down: '経費を減らす' }, ui.bDir, (v) => { ui.bDir = v; ui.touched.B = true; schedule(); })),
      gaugeField({ label: '変更する経費の額', value: ui.bAmount, max: 2_000_000, onChange: (v) => { ui.bAmount = v; ui.touched.B = true; schedule(); } }));
  };
  B.render = () => {
    if (!ui.bTarget) return setChildren(B.output, );
    const rules = rulesFor(state);
    const delta = (ui.bDir === 'up' ? 1 : -1) * ui.bAmount;
    const c = compareExpense(state, rules, { targetId: parseTarget(ui.bTarget).id, delta });
    if (!c.available) { notify('B', null); return setChildren(B.output, missingNote(c.after.missing) || h('p', { class: 'warn' }, '現在の入力では比較できません。')); }
    notify('B', ui.touched.B && ui.bAmount > 0 ? scenarioOf(c) : null);
    const clipped = c.applied !== delta;
    setChildren(B.output, 
      h('div', { class: 'hero' },
        h('p', { class: 'hero-label' }, '手元に残るお金の変化'),
        h('p', { class: 'hero-num' }, signed(c.cashChange)),
        h('p', { class: 'hint' }, `経費の変化 ${signed(c.applied)}（支出）／ 税金・社会保険料の変化 ${signed(c.taxChange)}。経費は税金を減らすためだけに使うものではなく、減る税額より支出の方が大きい点に注意してください。`)),
      clipped ? h('p', { class: 'note' }, '経費は0円未満にならないため、減らせる範囲に丸めています。') : null,
      cmpTable(c.mb, c.ma, c.diff, c.ma.businessTax > 0 || c.mb.businessTax > 0),
      notesList(c.notes));
  };

  A.onClose = () => notify('A', null);
  B.onClose = () => notify('B', null);

  // ---- C. 壁 ----
  const C = panel('収入を増やすと手取りはどう変わる？（壁の表示）', 'sim-walls', null);
  C.build = () => {
    const opts = targetOptions(state);
    ui.cTarget = pickTarget(ui.cTarget, opts, ['new:misc']);
    setChildren(C.controls, 
      field('どの収入を増やす？', select(opts, ui.cTarget, (v) => { ui.cTarget = v; schedule(); })),
      gaugeField({ label: 'どこまで増やして見る？', value: ui.cMax, max: 10_000_000, step: 100_000, onChange: (v) => { ui.cMax = Math.max(100_000, v); schedule(); } }));
  };
  C.render = () => {
    if (!ui.cTarget) return setChildren(C.output, );
    const rules = rulesFor(state);
    const step = Math.max(10_000, Math.ceil(ui.cMax / 300 / 10_000) * 10_000);
    const sw = sweepIncome(state, rules, { target: parseTarget(ui.cTarget), max: ui.cMax, step });
    if (!sw.ok) return setChildren(C.output, h('p', { class: 'warn' }, '現在の入力では、税制データが未登録の項目があり推移を計算できません。結果欄の注意を確認してください。'));
    setChildren(C.output, 
      chart(sw, ui.cMax),
      sw.reversals.length ? h('div', { class: 'warn' }, sw.reversals.map((r) => {
        const near = sw.walls.find((w) => w.add > r.from && w.add <= r.to);
        return h('p', {}, `⚠ 追加収入 ${formatYen(r.from)}円 → ${formatYen(r.to)}円 の間は、収入が増えても手取りが最大 ${formatYen(r.drop)}円 減ります（逆転）。${near ? `原因：${near.label}` : ''}`);
      })) : h('p', { class: 'note' }, 'この範囲では、収入が増えて手取りが減る逆転は起きません。'),
      h('h3', {}, '条件が変わる境界（壁）'),
      sw.walls.length ? h('ol', { class: 'wall-list' }, sw.walls.map((w) => h('li', {},
        h('strong', {}, `+${formatYen(w.add)}円付近`), '：', w.label,
        h('span', { class: 'hint' }, ` ${w.detail}。壁の前後の限界負担率 ${pct(w.marginalBefore === null ? null : w.marginalBefore * 100)} → ${pct(w.marginalAfter === null ? null : w.marginalAfter * 100)}${w.jump > 1000 && !w.noTaxEffect ? `。この境界で負担が ${formatYen(Math.round(w.jump))}円 段差的に増えます` : ''}［${w.source}］`)))) : h('p', { class: 'note' }, 'この範囲に、登録済みの境界はありません。'),
      h('details', { class: 'sub' }, h('summary', {}, '未対応の壁（資料が未確認）'), h('ul', { class: 'status-list' }, UNSUPPORTED_WALLS.map((t) => h('li', {}, t)))),
      tableView(sw, step),
      notesList(sw.notes));
  };

  // ---- D. FX 利確タイミング ----
  const D = panel('FXの利確タイミング（今年か来年か）', 'sim-fx', null);
  D.build = () => {
    setChildren(D.controls, 
      gaugeField({ label: '含み益（これから利確できる利益）', value: ui.fxUnreal, max: 5_000_000, onChange: (v) => { ui.fxUnreal = v; ui.fxRealize = Math.min(ui.fxRealize, v); schedule(); } }),
      gaugeField({ label: '今年利確する額（残りは来年）', value: ui.fxRealize, max: Math.max(ui.fxUnreal, 10_000), onChange: (v) => { ui.fxRealize = Math.min(v, ui.fxUnreal); schedule(); }, hint: '利確額スライダー：動かすと下の表が変わります。' }));
  };
  D.render = () => {
    const rules = rulesFor(state);
    const t = fxTiming(state, rules, { unrealized: ui.fxUnreal, realize: ui.fxRealize });
    const sel = t.evaluate(Math.min(ui.fxRealize, ui.fxUnreal));
    if (!t.now.ok) return setChildren(D.output, h('p', { class: 'warn' }, '現在の入力では、税制データが未登録の項目があり計算できません。結果欄の注意を確認してください。'));
    const col = (e) => [num(e.thisBurden), num(e.nextBurden), num(e.totalBurden)];
    const manLabel = (n) => `${Math.round(n / 1000) / 10}万円`;
    const cols = [['全額来年', t.now], [`今年${manLabel(sel.realize)}`, sel], ['全額今年', t.all]];
    const saving = t.all.totalBurden - t.best.totalBurden;
    setChildren(D.output, 
      h('p', { class: 'note' }, `今年の所得控除の余り：所得税 ${yen(t.slack?.incomeTax)}／住民税 ${yen(t.slack?.residentTax)}。この範囲までのFX利益には、その税目の税金がかかりません（控除の使い残しを活かせます）。`),
      t.carry.used > 0 || t.carry.remaining > 0 ? h('p', { class: 'note' }, `繰越損失：今年の現在の損益で ${yen(t.carry.used)} を消化、翌年へ ${yen(t.carry.remaining)} が残ります。`) : null,
      h('p', { class: 'hint' }, '税金・社会保険料の負担（円）。来年は同条件と仮定。'),
      h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl cmp' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), cols.map(([label]) => h('th', {}, label)))),
        h('tbody', {}, ['今年', '来年', '2年合計'].map((label, i) => h('tr', { class: i === 2 ? 'strong' : '' }, h('th', {}, label), cols.map(([, e]) => h('td', { class: 'r' }, col(e)[i]))))))),
      h('div', { class: 'hero' },
        h('p', { class: 'hero-label' }, '2年間の負担が最小になる利確額'),
        h('p', { class: 'hero-num' }, `今年 ${formatYen(t.best.realize)}円 ／ 来年 ${formatYen(ui.fxUnreal - t.best.realize)}円`),
        h('p', { class: 'hint' }, `2年合計の負担 ${yen(t.best.totalBurden)}（全額今年に利確する場合より ${yen(Math.max(0, saving))} 少ない）。同額なら今年に多く利確する側を表示しています。`)),
      h('p', { class: 'hint' }, '目安です。来年は「今年と同じ収入・同じ税制」と仮定し、今年の繰越損失の残りを引き継ぎます。相場の変動リスクや、利確を先送りする間の値動きは考慮していません。FXの損益は申告分離課税で、年またぎの扱いは決済した年で判定されます。'));
  };

  // ---- グラフ ----
  function chart(sw, max) {
    const W = 640; const H = 300; const m = { l: 64, r: 14, t: 18, b: 44 };
    const pw = W - m.l - m.r; const ph = H - m.t - m.b;
    const gains = sw.points.map((p) => p.gain);
    const yMax = Math.max(max, ...gains); const yMin = Math.min(0, ...gains);
    const X = (v) => m.l + (v / max) * pw;
    const Y = (v) => m.t + (1 - (v - yMin) / (yMax - yMin)) * ph;
    const fmt = (v) => `${Math.round(v / 10_000).toLocaleString('ja-JP')}万`;
    const g = svg('g');
    for (let i = 0; i <= 4; i++) {
      const v = yMin + ((yMax - yMin) * i) / 4;
      g.append(svg('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: 'c-grid' }), svg('text', { x: m.l - 8, y: Y(v) + 4, class: 'c-tick', 'text-anchor': 'end' }, fmt(v)));
    }
    for (let i = 0; i <= 5; i++) {
      const v = (max * i) / 5;
      g.append(svg('text', { x: X(v), y: H - m.b + 18, class: 'c-tick', 'text-anchor': 'middle' }, fmt(v)));
    }
    g.append(svg('text', { x: m.l + pw / 2, y: H - 6, class: 'c-axis', 'text-anchor': 'middle' }, '追加収入（円）'));
    g.append(svg('text', { x: 12, y: m.t + ph / 2, class: 'c-axis', 'text-anchor': 'middle', transform: `rotate(-90 12 ${m.t + ph / 2})` }, '手取りの増加額（円）'));
    sw.reversals.forEach((r) => g.append(svg('rect', { x: X(r.from), y: m.t, width: Math.max(3, X(r.to) - X(r.from)), height: ph, class: 'c-reversal' })));
    g.append(svg('line', { x1: X(0), y1: Y(0), x2: X(max), y2: Y(max), class: 'c-ref' }));
    g.append(svg('polyline', { points: sw.points.map((p) => `${X(p.add)},${Y(p.gain)}`).join(' '), class: 'c-line' }));
    sw.walls.forEach((w, i) => g.append(
      svg('line', { x1: X(w.add), x2: X(w.add), y1: m.t, y2: m.t + ph, class: 'c-wall' }),
      svg('circle', { cx: X(w.add), cy: m.t + 9 + (i % 3) * 20, r: 9, class: 'c-badge' }),
      svg('text', { x: X(w.add), y: m.t + 13 + (i % 3) * 20, class: 'c-badge-text', 'text-anchor': 'middle' }, i + 1)));
    const cross = svg('line', { x1: 0, x2: 0, y1: m.t, y2: m.t + ph, class: 'c-cross', visibility: 'hidden' });
    g.append(cross, svg('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent', class: 'c-hit' }));
    const readout = h('p', { class: 'hint chart-readout', 'aria-live': 'polite' }, 'グラフ上をなぞると、追加収入ごとの手取りが表示されます。');
    const el = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': '追加収入と手取りの増加額の推移。壁の位置に番号を付けています。', class: 'chart' }, g);
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W;
      const idx = Math.max(0, Math.min(sw.points.length - 1, Math.round(((x - m.l) / pw) * (sw.points.length - 1))));
      const p = sw.points[idx];
      cross.setAttribute('x1', X(p.add)); cross.setAttribute('x2', X(p.add)); cross.setAttribute('visibility', 'visible');
      readout.textContent = `追加収入 ${formatYen(p.add)}円 → 手取り ${signed(p.gain)}／負担 ${signed(p.burden - sw.points[0].burden)}${p.marginal !== null ? `／この区間の限界負担率 ${pct(p.marginal * 100)}` : ''}`;
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', move);
    const legend = h('p', { class: 'legend' },
      h('span', { class: 'lg' }, h('i', { class: 'sw sw-line' }), '手取りの増加額'),
      h('span', { class: 'lg' }, h('i', { class: 'sw sw-ref' }), '追加収入と同額（税・保険料がゼロの場合）'),
      h('span', { class: 'lg' }, h('i', { class: 'sw sw-wall' }), '壁（番号は下の一覧）'));
    return h('div', { class: 'chart-wrap' }, h('p', { class: 'chart-title' }, 'あと○円稼ぐと、手取りはいくら増える？'), el, legend, readout);
  }
  function tableView(sw, step) {
    const every = Math.max(1, Math.round(100_000 / step));
    const rows = sw.points.filter((_, i) => i % every === 0);
    return h('details', { class: 'sub' }, h('summary', {}, 'グラフのデータを表で見る'),
      h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, h('th', {}, '追加収入'), h('th', {}, '負担の増加'), h('th', {}, '手取りの増加'))),
        h('tbody', {}, rows.map((p) => h('tr', {}, h('td', { class: 'r' }, yen(p.add)), h('td', { class: 'r' }, signed(p.burden - sw.points[0].burden)), h('td', { class: 'r' }, signed(p.gain))))))));
  }

  // 主役は「あと○円稼いだら？」。経費・壁のグラフ・FXの利確は「くわしい比較」に畳む
  panels[0].el.open = true;
  const el = h('details', { class: 'card', id: 'sec-sim', open: true },
    h('summary', {}, 'もし利益が増えたら（変動シミュレーション）'),
    h('div', { class: 'body' },
      h('p', { class: 'note' }, '今の入力はそのままに、変えた場合の結果を並べて比べます。金額は目安です。'),
      panels[0].el,
      h('details', { class: 'edit' }, h('summary', {}, 'くわしい比較（経費・壁のグラフ・FXの利確タイミング）'), panels.slice(1).map((p) => p.el))));

  const rebuild = () => { panels.forEach((p) => p.build()); schedule(); };
  rebuild();
  el.addEventListener('toggle', () => { if (el.open) schedule(); });
  el.update = (s, evt) => {
    state = s;
    if (evt && evt.structural) rebuild(); else schedule();
  };
  return el;
}
