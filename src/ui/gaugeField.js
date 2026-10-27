// ゲージ(range)と数値入力の連動フィールド。直接入力が正で、範囲外の値も失わない。
import { h, nextId } from './dom.js';
import { clampForSlider, sliderMaxFor, snapToStep } from '../core/gauge.js';
import { formatYen, parseYen } from '../core/money.js';

/**
 * @param {object} o
 * @param {string} o.label
 * @param {number} o.value 現在値（円）
 * @param {number} o.max ゲージの既定最大値
 * @param {number} [o.step=10000]
 * @param {boolean} [o.allowNegative=false]
 * @param {(v:number)=>void} o.onChange
 * @param {string} [o.hint]
 * @param {string} [o.unit='円']
 */
export function gaugeField({ label, value, max, step = 10000, allowNegative = false, onChange, hint, unit = '円' }) {
  const id = nextId('g');
  const min = allowNegative ? -max : 0;
  let current = value;

  const text = h('input', {
    id, type: 'text', class: 'num', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
    inputmode: allowNegative ? 'text' : 'numeric', value: formatYen(value),
    'aria-describedby': `${id}-msg`,
  });
  const range = h('input', { type: 'range', class: 'gauge', step, 'aria-label': `${label}（ゲージ）` });
  const msg = h('p', { class: 'msg', id: `${id}-msg`, role: 'status' });

  const syncRange = () => {
    const rMax = sliderMaxFor(Math.abs(current), max, step);
    range.min = allowNegative ? -rMax : 0;
    range.max = rMax;
    range.value = clampForSlider(current, Number(range.min), rMax);
    const over = current > max || current < min;
    msg.textContent = over ? 'ゲージの範囲を超えています（入力値はそのまま使われます）' : '';
  };

  text.addEventListener('input', () => {
    // 入力中は文字列を書き換えない（桁が飛ぶのを防ぐ）。確定は blur で整形。
    const v = parseYen(text.value, { allowNegative });
    if (v == null) {
      text.classList.toggle('invalid', text.value.trim() !== '' && text.value.trim() !== '-');
      if (text.value.trim() === '') { current = 0; onChange(0); syncRange(); }
      return;
    }
    text.classList.remove('invalid');
    current = v;
    onChange(v);
    syncRange();
  });
  text.addEventListener('blur', () => {
    const v = parseYen(text.value, { allowNegative });
    text.classList.remove('invalid');
    text.value = formatYen(v ?? current);
  });
  range.addEventListener('input', () => {
    current = snapToStep(Number(range.value), step);
    text.value = formatYen(current);
    text.classList.remove('invalid');
    onChange(current);
    syncRange();
  });

  syncRange();
  return h('div', { class: 'field gauge-field' },
    h('label', { for: id }, label),
    h('div', { class: 'num-wrap' }, text, h('span', { class: 'unit' }, unit)),
    range,
    msg,
    hint ? h('p', { class: 'hint' }, hint) : null,
  );
}
