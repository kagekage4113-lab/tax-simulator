// 端数処理の集約。rule は税制データ(rounding.*)から渡す。ここに法定ルールを直書きしない。
export function applyRounding(value, rule) {
  const { rule: kind, unit } = rule;
  if (!Number.isInteger(unit) || unit < 1) throw new Error('rounding unit が不正です');
  const q = value / unit;
  if (kind === 'floor') return Math.floor(q) * unit;
  if (kind === 'ceil') return Math.ceil(q) * unit;
  if (kind === 'round') return Math.round(q) * unit;
  throw new Error(`未知の端数処理: ${kind}`);
}
