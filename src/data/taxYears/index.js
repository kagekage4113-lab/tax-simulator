// 年度別税制データのレジストリ。計算関数に税率・控除額を直接埋め込まず、ここから参照する。
// 公的資料で確認できた値のみ登録し、出典(sources)を併記する（2.1 / 5.4）。
// 未確認の項目は値を置かず null とし、unverified に記録する。
import { taxYear2025 } from './2025.js';
import { taxYear2026 } from './2026.js';
import { SRC, TOKYO23_KOKUHO, TOKYO23_RESIDENT, TOKYO_BUSINESS_TAX } from './local.js';

export const TAX_YEARS = {
  2025: taxYear2025,
  2026: taxYear2026,
};

export const SUPPORTED_YEARS = Object.keys(TAX_YEARS).map(Number);
export const DEFAULT_YEAR = 2026; // 令和8年分（このアプリが対応する年）
// 画面で選べる年。令和7年分のデータは、計算ロジックの検証（手計算のテスト）用に内部に残してある。
export const UI_YEARS = [2026];

// 住民税・国民健康保険料・個人事業税の地域別の値。年度データ本体は福山市の値を持つ（資料が先に揃ったため）。
// fukuyama は年度データそのもの、tokyo23 は住民税・国保・事業税だけを差し替える。控除額などの法定の値は全国共通で同じ。
export const AREAS = {
  tokyo23: { label: '東京23区（標準）', prefecture: '東京都' },
  fukuyama: { label: '福山市（広島県）', prefecture: '広島県' },
};
export const DEFAULT_AREA = 'tokyo23';

const derived = new Map();
function forTokyo23(base) {
  const advisories = (base.advisories || []).map((a) => a.replace('（福山市）', ''));
  advisories.push('住民税は東京23区（特別区民税・都民税）の値で計算しています。控除額などの法定の値は全国共通ですが、均等割の額・非課税の限度額・国民健康保険料は自治体で異なります。');
  return {
    ...base,
    advisories,
    sources: [...base.sources, SRC.TOKYO23_BOOKLET, SRC.TOKUBETSUKU_KOKUHO_R7, SRC.KYOKAI_TOKYO, SRC.NTA_GLOSSARY, SRC.CHIHOZEI_314_6],
    residentTax: TOKYO23_RESIDENT,
    businessTax: TOKYO_BUSINESS_TAX,
    socialInsurance: { ...base.socialInsurance, estimate: { ...base.socialInsurance.estimate, national: TOKYO23_KOKUHO } },
  };
}

// area を省略したときは福山市の値（年度データそのもの）。
export function getTaxYear(year, area) {
  const base = TAX_YEARS[year] || null;
  if (!base || area !== 'tokyo23') return base;
  const key = `${year}:${area}`;
  if (!derived.has(key)) derived.set(key, forTokyo23(base));
  return derived.get(key);
}

// 入力データ（state）の年度・地域に合う税制データ
export const rulesOf = (state) => getTaxYear(state.taxYear, state.residence && state.residence.area);

// 画面表示用ラベル（令和7年分 など）
export function yearLabel(year) {
  const r = year - 2018;
  return `令和${r}年分`;
}
