import { h } from './dom.js';
import { formatYen } from '../core/money.js';
import { metricsOf } from '../calc/simulate.js';

// 収入（経費を引いた後）のうち、手取りと各負担が何％かを1本の帯で見せる。
const pct = (v, base) => Math.round((v / base) * 1000) / 10;

// m は metricsOf() の結果。確定できない・収入が0以下のときは null。
function partsOf(m) {
  if (!m.ok || m.takeHome < 0) return null;
  const base = m.takeHome + m.burden;
  if (!(base > 0)) return null;
  const parts = [
    { label: '手取り', value: m.takeHome, cls: 'c1' },
    { label: '社会保険料', value: m.socialInsurance, cls: 'c3' },
    { label: '住民税', value: m.residentTax, cls: 'c2' },
    { label: '所得税', value: m.incomeTax, cls: 'c5' },
    { label: '個人事業税', value: m.businessTax, cls: 'c4' },
  ].filter((p) => p.value > 0);
  return { base, parts };
}

const barOf = (m, { base, parts }) => h('div', { class: 'bar meter-bar', role: 'img', 'aria-label': `手取り${pct(m.takeHome, base)}%、負担${pct(m.burden, base)}%` },
  parts.map((p) => h('span', { class: `seg ${p.cls}`, style: `width:${(p.value / base) * 100}%` },
    p.value / base >= 0.1 ? `${Math.round((p.value / base) * 100)}%` : null)));

export function burdenMeter(r) {
  const m = metricsOf(r);
  const x = partsOf(m);
  if (!x) return null;
  const { base, parts } = x;
  return h('div', { class: 'meter' },
    h('p', { class: 'meter-head' }, '収入のうち、税金・保険料で消える割合'),
    h('p', { class: 'meter-big' }, h('span', { class: 'meter-num' }, `${pct(m.burden, base).toFixed(1)}`), h('span', { class: 'meter-unit' }, '％')),
    barOf(m, x),
    h('ul', { class: 'meter-legend' }, parts.map((p) => h('li', {},
      h('span', { class: `dot ${p.cls}` }), h('span', { class: 'ml-label' }, p.label),
      h('span', { class: 'ml-pct' }, `${pct(p.value, base).toFixed(1)}%`),
      h('span', { class: 'ml-yen' }, `${formatYen(p.value)}円`)))),
    h('p', { class: 'hint' }, '収入から経費を引いた金額を100%としています。'));
}

// 「変更前」「変更後」の2本を並べて、負担率の変化を見せる。
export function burdenCompare(mb, ma) {
  const xb = partsOf(mb);
  const xa = partsOf(ma);
  if (!xb || !xa) return null;
  const rb = pct(mb.burden, xb.base);
  const ra = pct(ma.burden, xa.base);
  const d = Math.round((ra - rb) * 10) / 10;
  const row = (label, m, x, r) => h('div', { class: 'meter-row' },
    h('div', { class: 'meter-row-head' }, h('span', {}, label), h('strong', {}, `負担率 ${r.toFixed(1)}%`)),
    barOf(m, x));
  return h('div', { class: 'meter meter-cmp' },
    h('p', { class: 'meter-head' }, '負担率の変化'),
    h('p', { class: 'meter-big' }, h('span', { class: 'meter-num' }, `${rb.toFixed(1)}`), h('span', { class: 'meter-unit' }, '％'),
      h('span', { class: 'meter-arrow' }, '→'),
      h('span', { class: 'meter-num' }, `${ra.toFixed(1)}`), h('span', { class: 'meter-unit' }, '％')),
    h('p', { class: 'hint' }, d === 0 ? '負担率は変わりません。' : `負担率が ${Math.abs(d).toFixed(1)}ポイント${d > 0 ? '上がります' : '下がります'}。`),
    row('変更前', mb, xb, rb), row('変更後', ma, xa, ra),
    h('ul', { class: 'meter-key' }, xa.parts.map((p) => h('li', {}, h('span', { class: `dot ${p.cls}` }), p.label))));
}
