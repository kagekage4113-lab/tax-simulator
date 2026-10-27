// 年度別税制データのレジストリ。計算関数に税率・控除額を直接埋め込まず、ここから参照する。
// 公的資料で確認できた値のみ登録し、出典(sources)を併記する（2.1 / 5.4）。
// 未確認の項目は値を置かず null とし、unverified に記録する。
import { taxYear2025 } from './2025.js';
import { taxYear2026 } from './2026.js';

export const TAX_YEARS = {
  2025: taxYear2025,
  2026: taxYear2026,
};

export const SUPPORTED_YEARS = Object.keys(TAX_YEARS).map(Number);
export const DEFAULT_YEAR = 2026; // 令和8年分（資料で確認できた値が最も多い年）

export function getTaxYear(year) {
  return TAX_YEARS[year] || null;
}

// 画面表示用ラベル（令和7年分 など）
export function yearLabel(year) {
  const r = year - 2018;
  return `令和${r}年分`;
}
