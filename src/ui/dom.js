// 小さな DOM ヘルパ。innerHTML は使わず、ユーザー入力が HTML として解釈されないようにする。
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

let uid = 0;
export const nextId = (p = 'f') => `${p}-${++uid}`;

export function field(label, control, { hint, id } = {}) {
  const fid = id || control.id || nextId();
  control.id = fid;
  return h('div', { class: 'field' },
    h('label', { for: fid }, label),
    control,
    hint ? h('p', { class: 'hint' }, hint) : null,
  );
}

export function select(options, value, onChange) {
  const el = h('select', { onChange: (e) => onChange(e.target.value) },
    Object.entries(options).map(([k, label]) => h('option', { value: k, selected: String(k) === String(value) }, label)));
  return el;
}

export function checkbox(label, checked, onChange) {
  return h('label', { class: 'check' },
    h('input', { type: 'checkbox', checked, onChange: (e) => onChange(e.target.checked) }),
    h('span', {}, label));
}

export function badge(text, kind = '') {
  return h('span', { class: `badge ${kind}` }, text);
}
