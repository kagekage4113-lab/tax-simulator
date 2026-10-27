// 年度をまたいで共通に使う、自治体・都道府県の資料からの値。出典は docs/tax-sources/ に保存。
export const SRC = {
  NTA_R7_P55: { id: 'NTA_R7_P55', title: '令和7年分 年末調整のしかた（国税庁） 55〜56ページ「速算表」「参考」各控除額の表', localFile: 'docs/tax-sources/2025_nencho-guide_nta_p55-56_tables.pdf' },
  NTA_R8_P3: { id: 'NTA_R8_P3', title: '令和8年分 年末調整のしかた（国税庁） 3〜4ページ「昨年と比べて変わった点」（「改正前」列は令和7年分の所得要件として参照）', localFile: 'docs/tax-sources/2026_nencho-guide_nta_p3-4_changes.pdf' },
  NTA_R8_P55: { id: 'NTA_R8_P55', title: '令和8年分 年末調整のしかた（国税庁） 55〜56ページ「速算表」「参考」各控除額の表', localFile: 'docs/tax-sources/2026_nencho-guide_nta_p55-56_tables.pdf' },
  NTA_1410: { id: 'NTA_1410', title: '国税庁 タックスアンサー No.1410 給与所得控除［令和8年4月1日現在法令等］', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm', localFile: 'docs/tax-sources/nta_tax-answer-1410_salary-deduction_2026-04-01.pdf' },
  FUKUYAMA_RATE: { id: 'FUKUYAMA_RATE', title: '福山市「個人市民税の納税義務者と税額の計算方法・税率等について」（ページ掲載日2024年6月10日更新）', url: 'https://www.city.fukuyama.hiroshima.jp/soshiki/shiminzei/2179.html', localFile: 'docs/tax-sources/fukuyama_resident-tax_printed-2026-10-27.pdf' },
  FUKUYAMA_DED: { id: 'FUKUYAMA_DED', title: '福山市「所得控除の種類」（2026年5月22日更新。令和8年度＝令和7年中の所得に対する住民税の控除額）', url: 'https://www.city.fukuyama.hiroshima.jp/soshiki/shiminzei/2180.html', localFile: 'docs/tax-sources/fukuyama_resident-deductions_updated-2026-05-22.pdf' },
  HIROSHIMA: { id: 'HIROSHIMA', title: '広島県「個人事業税について」（掲載日2025年4月1日）', url: 'https://www.pref.hiroshima.lg.jp/site/zei/1170306367409.html', localFile: 'docs/tax-sources/hiroshima_business-tax_printed-2026-10-27.pdf' },
  NTA_2260: { id: 'NTA_2260', title: '国税庁 タックスアンサー No.2260 所得税の税率［令和8年4月1日現在法令等］', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm', localFile: 'docs/tax-sources/nta_tax-answer-2260_income-tax-rate_2026-04-01.pdf' },
  FUKUYAMA_DIFF: { id: 'FUKUYAMA_DIFF', title: '福山市「人的控除額の差額一覧表」（2026年5月22日更新）', url: 'https://www.city.fukuyama.hiroshima.jp/soshiki/shiminzei/2181.html', localFile: 'docs/tax-sources/fukuyama_personal-deduction-diff_updated-2026-05-22.pdf' },
  KYOKAI_R7_HIROSHIMA: { id: 'KYOKAI_R7_HIROSHIMA', title: '協会けんぽ 広島支部 令和7年3月分（4月納付分）からの保険料額表（リーフレット）', localFile: 'docs/tax-sources/kyokai-kenpo_2025-03_hiroshima.pdf' },
  KYOKAI_R7_TOKYO: { id: 'KYOKAI_R7_TOKYO', title: '協会けんぽ 東京支部 令和7年3月分（4月納付分）からの保険料額表（リーフレット）', localFile: 'docs/tax-sources/kyokai-kenpo_2025-03_tokyo.pdf' },
  KYOKAI_R7_OSAKA: { id: 'KYOKAI_R7_OSAKA', title: '協会けんぽ 大阪支部 令和7年3月分（4月納付分）からの保険料額表（リーフレット）', localFile: 'docs/tax-sources/kyokai-kenpo_2025-03_osaka.pdf' },
  NTA_1521: { id: 'NTA_1521', title: '国税庁 タックスアンサー No.1521 外国為替証拠金取引(FX)の課税関係［令和8年4月1日現在法令等］', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1521.htm', localFile: 'docs/tax-sources/nta_tax-answer-1521_fx_2026-04-01.pdf' },
  KYOKAI_HIROSHIMA: { id: 'KYOKAI_HIROSHIMA', title: '協会けんぽ 広島支部 令和8年3月分（4月納付分）からの保険料額表', localFile: 'docs/tax-sources/kyokai-kenpo_2026-03_hiroshima.pdf' },
  KYOKAI_FUKUOKA: { id: 'KYOKAI_FUKUOKA', title: '協会けんぽ 福岡支部 令和8年3月分（4月納付分）からの保険料額表', localFile: 'docs/tax-sources/kyokai-kenpo_2026-03_fukuoka.pdf' },
  KYOKAI_OSAKA: { id: 'KYOKAI_OSAKA', title: '協会けんぽ 大阪支部 令和8年3月分（4月納付分）からの保険料額表', localFile: 'docs/tax-sources/kyokai-kenpo_2026-03_osaka.pdf' },
  FUKUYAMA_ADJ: { id: 'FUKUYAMA_ADJ', title: '福山市「調整控除について」（2026年6月12日更新。人的控除額の差額一覧表は未入手）', url: 'https://www.city.fukuyama.hiroshima.jp/soshiki/shiminzei/2183.html', localFile: 'docs/tax-sources/fukuyama_adjustment-credit_updated-2026-06-12.pdf' },
};

// 所得税の速算表（NTA_2260）。課税される所得金額（1,000円未満切捨後）に対する税額 = 所得金額×税率−控除額。
// 基準所得金額が3億3,000万円を超える場合の特例（令和7年分から・NTA_2260 ※1）は対象外。
export const INCOME_TAX_BRACKETS = [
  { upTo: 1_950_000, rate: 0.05, deduction: 0 },
  { upTo: 3_300_000, rate: 0.1, deduction: 97_500 },
  { upTo: 6_950_000, rate: 0.2, deduction: 427_500 },
  { upTo: 9_000_000, rate: 0.23, deduction: 636_000 },
  { upTo: 18_000_000, rate: 0.33, deduction: 1_536_000 },
  { upTo: 40_000_000, rate: 0.4, deduction: 2_796_000 },
  { upTo: null, rate: 0.45, deduction: 4_796_000 },
];

export const RECON_RATE = 0.021;

// FX・先物取引（NTA_1521）: 所得税15%＋地方税5%の申告分離課税。損失は翌年以後3年内の「先物取引に係る雑所得等」から控除できる。
export const FX = { incomeTaxRate: 0.15, residentTaxRate: 0.05, carryForwardYears: 3 };

// 所得者の合計所得金額による列（配偶者控除・配偶者特別控除）
export const OWNER_COLUMNS = [9_000_000, 9_500_000, 10_000_000];

// 配偶者特別控除の段階（配偶者の合計所得金額）。所得税・住民税とも、62万/58万超〜95万以下が最上段で以降は共通の刻み。
const specialStepsTax = [
  { upTo: 950_000, amounts: [380_000, 260_000, 130_000] },
  { upTo: 1_000_000, amounts: [360_000, 240_000, 120_000] },
  { upTo: 1_050_000, amounts: [310_000, 210_000, 110_000] },
  { upTo: 1_100_000, amounts: [260_000, 180_000, 90_000] },
  { upTo: 1_150_000, amounts: [210_000, 140_000, 70_000] },
  { upTo: 1_200_000, amounts: [160_000, 110_000, 60_000] },
  { upTo: 1_250_000, amounts: [110_000, 80_000, 40_000] },
  { upTo: 1_300_000, amounts: [60_000, 40_000, 20_000] },
  { upTo: 1_330_000, amounts: [30_000, 20_000, 10_000] },
];
export const SPECIAL_STEPS_IT = specialStepsTax;

// 特定親族特別控除（所得税）：段階は令和7年分・令和8年分とも金額は同じ（下限の所得だけが年分で違う）
export const SPECIFIC_RELATIVE_IT_STEPS = [
  { upTo: 850_000, amount: 630_000 }, { upTo: 900_000, amount: 610_000 }, { upTo: 950_000, amount: 510_000 },
  { upTo: 1_000_000, amount: 410_000 }, { upTo: 1_050_000, amount: 310_000 }, { upTo: 1_100_000, amount: 210_000 },
  { upTo: 1_150_000, amount: 110_000 }, { upTo: 1_200_000, amount: 60_000 }, { upTo: 1_230_000, amount: 30_000 },
];

// 福山市（令和8年度＝令和7年中の所得に対する住民税）。FUKUYAMA_DED
export const FUKUYAMA_RESIDENT_DEDUCTIONS_R8NENDO = {
  spouse: {
    ownerIncomeLimit: 10_000_000,
    ownerColumns: OWNER_COLUMNS,
    spouseIncomeMax: 580_000,
    general: [330_000, 220_000, 110_000],
    elder: [380_000, 260_000, 130_000],
    specialSteps: [
      { upTo: 1_000_000, amounts: [330_000, 220_000, 110_000] },
      { upTo: 1_050_000, amounts: [310_000, 210_000, 110_000] },
      { upTo: 1_100_000, amounts: [260_000, 180_000, 90_000] },
      { upTo: 1_150_000, amounts: [210_000, 140_000, 70_000] },
      { upTo: 1_200_000, amounts: [160_000, 110_000, 60_000] },
      { upTo: 1_250_000, amounts: [110_000, 80_000, 40_000] },
      { upTo: 1_300_000, amounts: [60_000, 40_000, 20_000] },
      { upTo: 1_330_000, amounts: [30_000, 20_000, 10_000] },
    ],
  },
  dependent: {
    incomeMax: 580_000,
    general: { minAge: 16, amount: 330_000 },
    specific: { minAge: 19, maxAge: 22, amount: 450_000 },
    elder: { minAge: 70, other: 380_000, cohabitingParent: 450_000 },
  },
  specificRelative: {
    incomeMin: 580_000,
    incomeMax: 1_230_000,
    steps: [
      { upTo: 950_000, amount: 450_000 }, { upTo: 1_000_000, amount: 410_000 }, { upTo: 1_050_000, amount: 310_000 },
      { upTo: 1_100_000, amount: 210_000 }, { upTo: 1_150_000, amount: 110_000 }, { upTo: 1_200_000, amount: 60_000 },
      { upTo: 1_230_000, amount: 30_000 },
    ],
    ageMin: 19, // 「19歳以上23歳未満」（FUKUYAMA_DED の定義）
    ageMax: 22,
  },
  disability: { general: 260_000, special: 300_000, specialCohabiting: 530_000 }, // 同居特別障がい者は特別障がい者30万円に23万円加算
  widow: 260_000,
  singleParent: 300_000,
  widowSingleParentIncomeMax: 5_000_000,
  workingStudent: { amount: 260_000, incomeMax: 850_000 },
};

export const FUKUYAMA_RESIDENT_BASIC_R8NENDO = [
  { upTo: 24_000_000, amount: 430_000 },
  { upTo: 24_500_000, amount: 290_000 },
  { upTo: 25_000_000, amount: 150_000 },
  { upTo: null, amount: 0 },
];

// 調整控除（FUKUYAMA_ADJ の算式 / FUKUYAMA_DIFF の差額）。人的控除額の差（所得税−住民税）の合計に基づき所得割から控除する。
// 資格要件（所得要件・年齢）は住民税の人的控除と同じ。差額を金額とした「人的控除データ」として表現する。
// ※ひとり親は、差額は5万円だが調整控除の計算では男性1万円（女性5万円）。性別の入力がないため1万円（少なめ）で計算する。
// ※特定親族特別控除・配偶者特別控除は差額なし（令和8年度から）。基礎控除は合計所得金額に関わらず一律5万円。
const zeroSteps = (steps) => steps.map((x) => ({ ...x, amounts: [0, 0, 0] }));
const zeroSteps1 = (steps) => steps.map((x) => ({ ...x, amount: 0 }));
const R = FUKUYAMA_RESIDENT_DEDUCTIONS_R8NENDO;
export const FUKUYAMA_ADJUSTMENT = {
  rate: 0.05, // 市民税3%＋県民税2%
  threshold: 2_000_000, // 合計課税所得金額200万円
  upperLimit: 25_000_000, // 2,500万円超は適用なし
  minAfter: 50_000, // 200万円超では (①−(②−200万)) が5万円を下回る場合は5万円
  basicDiff: 50_000,
  diffDeductions: {
    spouse: { ...R.spouse, general: [50_000, 40_000, 20_000], elder: [100_000, 60_000, 30_000], specialSteps: zeroSteps(R.spouse.specialSteps) },
    dependent: {
      ...R.dependent,
      general: { ...R.dependent.general, amount: 50_000 },
      specific: { ...R.dependent.specific, amount: 180_000 },
      elder: { ...R.dependent.elder, other: 100_000, cohabitingParent: 130_000 },
    },
    specificRelative: { ...R.specificRelative, steps: zeroSteps1(R.specificRelative.steps) },
    disability: { general: 10_000, special: 100_000, specialCohabiting: 220_000 },
    widow: 10_000,
    singleParent: 10_000,
    widowSingleParentIncomeMax: R.widowSingleParentIncomeMax,
    workingStudent: { ...R.workingStudent, amount: 10_000 },
  },
};

export const FUKUYAMA_RESIDENT = {
  scope: '福山市（広島県）',
  incomeRate: 0.1, // 所得割：市民税6%＋県民税4%
  perCapita: 5_500, // 均等割4,500円（市3,000＋県1,500、ひろしまの森づくり県民税500円を含む）＋森林環境税1,000円
  adjustment: FUKUYAMA_ADJUSTMENT,
  nonTaxable: { perPerson: 350_000, base: 100_000, addIfDependents: { allIncome: 210_000, incomeLevy: 320_000 } },
};

export const HIROSHIMA_BUSINESS_TAX = {
  scope: '広島県',
  mainDeduction: 2_900_000,
  blueDeductionApplies: false,
  rates: { type1: 0.05, type2: 0.04, type3: 0.05, type3b: 0.03 },
};

export const MEDICAL = {
  // 福山市「所得控除の種類」の医療費控除（10万円または総所得金額等の5%の少ない額、限度額200万円）。所得税でも同じ仕組みだが国税庁の資料は未確認。
  thresholdFixed: 100_000, thresholdRate: 0.05, cap: 2_000_000,
};
