import { h } from './dom.js';
import { formatYen } from '../core/money.js';

// 収入（経費を引いた後）のうち、手取りと各負担が何％かを1本の帯で見せる。
const pct = (v, base) => Math.round((v / base) * 1000) / 10;

export function burdenMeter(r) {
  if (r.takeHome == null || r.burden == null) return null;
  const base = r.takeHome + r.burden;
  if (!(base > 0) || r.takeHome < 0) return null;

  const parts = [
    { label: '手取り', value: r.takeHome, cls: 'c1' },
    { label: '社会保険料', value: r.socialInsurance.total, cls: 'c3' },
    { label: '住民税', value: r.residentTax.total, cls: 'c2' },
    { label: '所得税', value: r.incomeTax.total, cls: 'c5' },
    { label: '個人事業税', value: r.businessTax.total, cls: 'c4' },
  ].filter((p) => p.value > 0);

  const bar = h('div', { class: 'bar meter-bar', role: 'img', 'aria-label': `手取り${pct(r.takeHome, base)}%、負担${pct(r.burden, base)}%` },
    parts.map((p) => h('span', { class: `seg ${p.cls}`, style: `width:${(p.value / base) * 100}%` },
      p.value / base >= 0.1 ? `${Math.round((p.value / base) * 100)}%` : null)));

  return h('div', { class: 'meter' },
    h('p', { class: 'meter-head' }, '収入のうち、税金・保険料で消える割合'),
    h('p', { class: 'meter-big' }, h('span', { class: 'meter-num' }, `${pct(r.burden, base).toFixed(1)}`), h('span', { class: 'meter-unit' }, '％')),
    bar,
    h('ul', { class: 'meter-legend' }, parts.map((p) => h('li', {},
      h('span', { class: `dot ${p.cls}` }), h('span', { class: 'ml-label' }, p.label),
      h('span', { class: 'ml-pct' }, `${pct(p.value, base).toFixed(1)}%`),
      h('span', { class: 'ml-yen' }, `${formatYen(p.value)}円`)))),
    h('p', { class: 'hint' }, '収入から経費を引いた金額を100%としています。'));
}
