// 金額は常に整数（円）。端数処理はここに集約し、税目ごとの法定ルールをフェーズ2で割り当てる。

export const floorTo = (value, unit = 1) => Math.floor(value / unit) * unit;
export const ceilTo = (value, unit = 1) => Math.ceil(value / unit) * unit;

// 金額×率の切り捨て。2.1%など小数の率で 2530.5 → 2530.4999… となり1円ずれないよう、微小値を足してから切り捨てる。
export const mulFloor = (value, rate) => Math.floor(value * rate + 1e-6);

export const MAX_YEN = 9_999_999_999_999; // 入力の上限（安全な整数範囲内）

// 文字列 → 整数円。全角数字・カンマ・円記号を許容。空/不正は null。
export function parseYen(text, { allowNegative = false } = {}) {
  if (typeof text === 'number') return Number.isFinite(text) ? Math.trunc(text) : null;
  if (typeof text !== 'string') return null;
  let s = text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[，,円¥￥\s]/g, '')
    .replace(/[−―－ー]/g, '-');
  if (s === '' || s === '-') return null;
  const re = allowNegative ? /^-?\d+$/ : /^\d+$/;
  if (!re.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return null;
  return Math.max(-MAX_YEN, Math.min(MAX_YEN, n));
}

export const formatYen = (n) => (Number.isFinite(n) ? n.toLocaleString('ja-JP') : '');
