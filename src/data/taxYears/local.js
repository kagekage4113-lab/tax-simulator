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
  NTA_1900: { id: 'NTA_1900', title: '国税庁 タックスアンサー No.1900 給与所得者で確定申告が必要な人［令和8年4月1日現在法令等］', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1900.htm', localFile: 'docs/tax-sources/nta_tax-answer-1900_filing-required-salary_2026-04-01.pdf' },
  NTA_1525: { id: 'NTA_1525', title: '国税庁 タックスアンサー No.1525 暗号資産交換業者から暗号資産に代えて金銭の補償を受けた場合［令和8年4月1日現在法令等］（補償金は総合課税の雑所得、損失は他の雑所得と通算可）', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1525.htm', localFile: 'docs/tax-sources/nta_tax-answer-1525_crypto-compensation_2026-04-01.pdf' },
  FUKUYAMA_KOKUHO: { id: 'FUKUYAMA_KOKUHO', title: '福山市「国民健康保険税について」（2026年7月7日更新。令和8年度＝令和7年中の所得に対する国保税）', url: 'https://www.city.fukuyama.hiroshima.jp/soshiki/hokennenkin/405324.html', localFile: 'docs/tax-sources/fukuyama_national-health-insurance-tax_updated-2026-07-07.pdf' },
  NENKIN_PREMIUM: { id: 'NENKIN_PREMIUM', title: '日本年金機構「国民年金保険料」（更新日2026年4月1日）：令和8年度の保険料は1か月17,920円（付加保険料400円）', url: 'https://www.nenkin.go.jp/service/kokunen/hokenryo/hokenryo.html', localFile: 'docs/tax-sources/nenkin-kikou_national-pension-premium_updated-2026-04-01.pdf' },
  SECONDARY_KOKUHO_REDUCTION: { id: 'SECONDARY_KOKUHO_REDUCTION', title: '【二次情報】国保の法定軽減（7割・5割・2割）の判定基準。ユーザーが提供した解説文（出典の記載なし）。福山市の公式資料は未確認', secondary: true },
  NTA_CRYPTO_FAQ: { id: 'NTA_CRYPTO_FAQ', title: '国税庁「暗号資産に関する税務上の取扱いについて（FAQ）」平成30年11月（令和4年12月最終改定。令和4年12月1日現在の法令等）', localFile: 'docs/tax-sources/nta_crypto-faq_2022-12.pdf' },
  NTA_INSURANCE: { id: 'NTA_INSURANCE', title: '国税庁 パンフレット「暮らしの税情報」（令和8年度版）保険と税（生命保険料控除・地震保険料控除）', url: 'https://www.nta.go.jp/publication/pamph/koho/kurashi/html/04_2.htm', localFile: 'docs/tax-sources/nta_pamphlet-2026_insurance-and-tax.pdf' },
  SECONDARY_FURUSATO: { id: 'SECONDARY_FURUSATO', title: '【二次情報】ふるさと納税の控除上限額：ふるさと納税サイト「さとふる」の早見表・シミュレーション（税理士監修・2026年4月現在の制度）と一般的な算式。総務省の公式資料は未確認', url: 'https://www.satofull.jp/static/calculation01.php', localFile: 'docs/tax-sources/satofull_furusato-limit-table_2026-04.pdf', secondary: true },
  NTA_1535: { id: 'NTA_1535', title: '国税庁 タックスアンサー No.1535 NISA制度［令和8年4月1日現在法令等］', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1535.htm', localFile: 'docs/tax-sources/nta_tax-answer-1535_nisa_2026-04-01.pdf' },
  NTA_1110: { id: 'NTA_1110', title: '国税庁 タックスアンサー No.1110 災害や盗難などで資産に損害を受けたとき（雑損控除）［令和8年4月1日現在法令等］', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1110.htm', localFile: 'docs/tax-sources/nta_tax-answer-1110_casualty-loss_2026-04-01.pdf' },
  NTA_STOCKS: { id: 'NTA_STOCKS', title: '国税庁 パンフレット「暮らしの税情報」（令和8年度版）株式・配当・利子と税', url: 'https://www.nta.go.jp/publication/pamph/koho/kurashi/html/04_5.htm', localFile: 'docs/tax-sources/nta_pamphlet-2026_stocks-dividends-interest.pdf' },
  NTA_1250: { id: 'NTA_1250', title: '国税庁 タックスアンサー No.1250 配当所得があるとき（配当控除）［令和8年4月1日現在法令等］（未対応。記録のみ）', localFile: 'docs/tax-sources/nta_tax-answer-1250_dividend-credit_2026-04-01.pdf' },
  NTA_1521: { id: 'NTA_1521', title: '国税庁 タックスアンサー No.1521 外国為替証拠金取引(FX)の課税関係［令和8年4月1日現在法令等］', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1521.htm', localFile: 'docs/tax-sources/nta_tax-answer-1521_fx_2026-04-01.pdf' },
  NTA_1522: { id: 'NTA_1522', title: '国税庁 タックスアンサー No.1522 先物取引に係る雑所得等の課税の特例［令和8年4月1日現在法令等］', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1522.htm', localFile: 'docs/tax-sources/nta_tax-answer-1522_futures_2026-04-01.pdf' },
  NTA_1523: { id: 'NTA_1523', title: '国税庁 タックスアンサー No.1523 先物取引の差金等決済に係る損失の繰越控除［令和8年4月1日現在法令等］', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1523.htm', localFile: 'docs/tax-sources/nta_tax-answer-1523_futures-loss-carryforward_2026-04-01.pdf' },
  KYOKAI_HIROSHIMA: { id: 'KYOKAI_HIROSHIMA', title: '協会けんぽ 広島支部 令和8年3月分（4月納付分）からの保険料額表', localFile: 'docs/tax-sources/kyokai-kenpo_2026-03_hiroshima.pdf' },
  KYOKAI_FUKUOKA: { id: 'KYOKAI_FUKUOKA', title: '協会けんぽ 福岡支部 令和8年3月分（4月納付分）からの保険料額表', localFile: 'docs/tax-sources/kyokai-kenpo_2026-03_fukuoka.pdf' },
  KYOKAI_OSAKA: { id: 'KYOKAI_OSAKA', title: '協会けんぽ 大阪支部 令和8年3月分（4月納付分）からの保険料額表', localFile: 'docs/tax-sources/kyokai-kenpo_2026-03_osaka.pdf' },
  FUKUYAMA_ADJ: { id: 'FUKUYAMA_ADJ', title: '福山市「調整控除について」（2026年6月12日更新。人的控除額の差額一覧表は未入手）', url: 'https://www.city.fukuyama.hiroshima.jp/soshiki/shiminzei/2183.html', localFile: 'docs/tax-sources/fukuyama_adjustment-credit_updated-2026-06-12.pdf' },
  NTA_1160: { id: 'NTA_1160', title: '国税庁 タックスアンサー No.1160 障害者控除［令和8年4月1日現在法令等］', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1160.htm', localFile: 'docs/tax-sources/nta_tax-answer-1160_disability-deduction_2026-04-01.pdf' },
  NTA_1170: { id: 'NTA_1170', title: '国税庁 タックスアンサー No.1170 寡婦控除［令和8年4月1日現在法令等］', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1170.htm', localFile: 'docs/tax-sources/nta_tax-answer-1170_widow-deduction_2026-04-01.pdf' },
  NTA_1171: { id: 'NTA_1171', title: '国税庁 タックスアンサー No.1171 ひとり親控除［令和8年4月1日現在法令等］', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1171.htm', localFile: 'docs/tax-sources/nta_tax-answer-1171_single-parent-deduction_2026-04-01.pdf' },
  NTA_1600: { id: 'NTA_1600', title: '国税庁 タックスアンサー No.1600 公的年金等の課税関係［令和8年4月1日現在法令等］', url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1600.htm', localFile: 'docs/tax-sources/nta_tax-answer-1600_public-pension_2026-04-01.pdf' },
  NTA_FORM_T3: { id: 'NTA_FORM_T3', title: '国税庁 確定申告書 第三表（分離課税用）様式（令和7年分以降用）：「所得から差し引かれる金額（第一表の㉚）」と、総合課税・譲渡・株式・配当・先物取引などの「課税される所得金額」の対応分を並べた様式', localFile: 'docs/tax-sources/nta_form_income-tax-return-table3-separate-taxation_R7.pdf' },
  FUKUYAMA_R8_REFORM: { id: 'FUKUYAMA_R8_REFORM', title: '福山市「2026年度（令和8年度）から適用される主な市・県民税の税制改正点」（掲載日2025年6月16日更新）', url: 'https://www.city.fukuyama.hiroshima.jp/soshiki/shiminzei/368918.html', localFile: 'docs/tax-sources/fukuyama_r8-reform-highlights_updated-2025-06-16.pdf' },
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

// FX・先物取引（NTA_1521・NTA_1522）: 所得税15%＋地方税5%の申告分離課税。損失は同制度内でのみ通算し、一定の要件の下で翌年以後3年間繰り越せる。
// 対象は商品先物取引等・金融商品先物取引等（株価指数先物・オプション等）・国内のFX（第一種金融商品取引業者等）で、一定の暗号資産に係る店頭デリバティブは除く。
// 雑損控除（NTA_1110。住民税も福山市 FUKUYAMA_DED で同じ式）: (1)（損害金額＋災害等関連支出−保険金等）−総所得金額等×10% と (2)（災害関連支出−保険金等）−5万円 のいずれか多い額
export const CASUALTY = { incomeRate: 0.1, relatedFloor: 50_000 };

// 上場株式等の譲渡益・配当（申告分離課税）（NTA_STOCKS）: 譲渡益×所得税15%（ほかに住民税5%）＋復興特別所得税。損失は上場株式等の譲渡益・配当（申告分離を選択）と損益通算でき、
// 通算してもなお控除しきれない損失は翌年以後3年間繰越控除できる（確定申告が必要）。NISA口座の損失はないものとみなされる。
export const LISTED = { incomeTaxRate: 0.15, residentTaxRate: 0.05, carryForwardYears: 3 };

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

const KOKUHO_ADVISORIES = [
  '国民健康保険税の法定軽減（7・5・2割）の判定基準は、ユーザー提供の二次情報に基づく値です（福山市の公式資料は未確認）。',
  '個人事業主の国保税は令和8年度（令和7年所得）の福山市の値、国民年金は令和8年度の額（月17,920円）を、年分にかかわらず当てはめた概算です（令和9年度の税率・令和7年度の年金額は未入手）。',
];

// 福山市の国民健康保険税 令和8年度（令和7年中の所得に対する分）。FUKUYAMA_KOKUHO。
//  ・所得割 =（所得−基礎控除）×税率、均等割 = 加入者1人あたり、平等割 = 1世帯あたり。各区分の合計（100円未満切捨）が課税限度額を超えれば限度額。
//  ・介護分は40歳以上65歳未満のみ。65歳以上は介護分の課税なし（別途介護保険料）。75歳以上は後期高齢者医療のため国保の対象外。
//  ・子ども分の均等割は18歳未満は全額軽減。18歳以上は均等割とは別に「18歳以上被保険者均等割」79円。
//  ・未就学児の均等割は5割軽減。
// 未登録: 法定軽減（7割・5割・2割）の判定基準、国民年金保険料、特定世帯・特定継続世帯、年度途中加入の月割。
export const FUKUYAMA_KOKUHO = {
  model: 'fukuyamaKokuho',
  advisories: KOKUHO_ADVISORIES,
  scope: '福山市（広島県）',
  basicDeduction: FUKUYAMA_RESIDENT_BASIC_R8NENDO, // 合計所得金額による基礎控除（注）：43万円（2,400万円以下）／29万円／15万円／適用なし
  rounding: { rule: 'floor', unit: 100 },
  retireAge: 75,
  preschool: { underAge: 6, reduction: 0.5 }, // 未就学児の均等割5割軽減
  components: {
    medical: { incomeRate: 0.0899, perPerson: 29_520, perHousehold: 19_680, limit: 670_000 },
    support: { incomeRate: 0.0315, perPerson: 10_680, perHousehold: 6_480, limit: 260_000 },
    care: { incomeRate: 0.0279, perPerson: 9_960, perHousehold: 4_800, limit: 170_000, ageMin: 40, ageMax: 64 },
    children: { incomeRate: 0.0029, perPerson: 1_262, perPersonAdult: 79, perHousehold: 802, limit: 30_000, exemptUnderAge: 18 },
  },
  // 国民年金（第1号被保険者）: 令和8年度の月額17,920円（NENKIN_PREMIUM）。20歳以上60歳未満の本人・配偶者が対象。令和7年度の額は未入手のため令和8年度の値で代用
  pension: { monthly: 17_920, ageMin: 20, ageMax: 59 },
  // 法定軽減（二次情報）: 世帯の判定用所得（基礎控除前の合計所得）が基準以下なら、均等割・平等割を7割・5割・2割軽減。
  //   7割: 43万円＋10万円×(給与・年金所得者数−1) / 5割: 7割の基準＋31万円×被保険者数 / 2割: 7割の基準＋57万円×被保険者数
  //   給与・年金所得者＝給与収入55万円超など。扶養者側の給与・年金の有無は入力がないため、本人の給与収入のみで数える。
  reduction: { base: 430_000, perSalaryOrPensionEarner: 100_000, salaryRevenueMin: 550_000, tiers: [{ rate: 0.7, perInsured: 0 }, { rate: 0.5, perInsured: 310_000 }, { rate: 0.2, perInsured: 570_000 }], secondary: true },
};

export const FUKUYAMA_RESIDENT = {
  scope: '福山市（広島県）',
  incomeRate: 0.1, // 所得割：市民税6%＋県民税4%
  perCapita: 5_500, // 均等割4,500円（市3,000＋県1,500、ひろしまの森づくり県民税500円を含む）＋森林環境税1,000円
  adjustment: FUKUYAMA_ADJUSTMENT,
  // 非課税（FUKUYAMA_RATE）。扶養人数＝同一生計配偶者＋扶養親族（16歳未満を含む）。
  //  ・障がい者・未成年者・ひとり親・寡婦で前年の合計所得金額が135万円以下 → 均等割・所得割とも非課税
  //  ・合計所得金額 ≦ (本人+扶養人数)×35万円+10万円(+21万円: 同一生計配偶者・扶養親族がいる場合) → 均等割・所得割とも非課税
  //  ・総所得金額等 ≦ (本人+扶養人数)×35万円+10万円(+32万円: 同上) → 所得割のみ非課税
  nonTaxable: { perPerson: 350_000, base: 100_000, addIfDependents: { allIncome: 210_000, incomeLevy: 320_000 }, specialGroup: { incomeMax: 1_350_000, minorUnderAge: 18 } },
};

export const HIROSHIMA_BUSINESS_TAX = {
  scope: '広島県',
  mainDeduction: 2_900_000,
  blueDeductionApplies: false,
  rates: { type1: 0.05, type2: 0.04, type3: 0.05, type3b: 0.03 },
};

// 生命保険料控除・地震保険料控除の表。表は [{ upTo, rate, add }]（控除額 = 支払保険料×rate + add）。
// 所得税: 国税庁「暮らしの税情報（令和8年度版）保険と税」（NTA_INSURANCE）。23歳未満の扶養親族がいる場合の新生命保険料の特例は令和8年分・令和9年分のみ。
const T = (...rows) => rows.map(([upTo, rate, add]) => ({ upTo, rate, add }));
const INSURANCE_IT_BASE = {
  life: {
    newTable: T([20_000, 1, 0], [40_000, 0.5, 10_000], [80_000, 0.25, 20_000], [null, 0, 40_000]),
    oldTable: T([25_000, 1, 0], [50_000, 0.5, 12_500], [100_000, 0.25, 25_000], [null, 0, 50_000]),
    bothRule: { oldBasis: 'premium', oldOver: 60_000 }, // 旧契約の支払保険料が6万円を超える場合は旧契約のみ（最高5万円）
    oldOnlyMax: 50_000,
    bothSumMax: 40_000, // 旧契約が6万円以下で新旧両方ある場合の合計の最高額
    totalMax: 120_000, // 生命保険料・個人年金保険料・介護医療保険料の合計の最高額
  },
  earthquake: {
    quakeTable: T([50_000, 1, 0], [null, 0, 50_000]),
    oldLongTable: T([10_000, 1, 0], [20_000, 0.5, 5_000], [null, 0, 15_000]),
    totalMax: 50_000,
  },
};
export const INSURANCE_IT_2025 = INSURANCE_IT_BASE;
export const INSURANCE_IT_2026 = {
  ...INSURANCE_IT_BASE,
  life: { ...INSURANCE_IT_BASE.life, newLifeUnder23: { table: T([30_000, 1, 0], [60_000, 0.5, 15_000], [120_000, 0.25, 30_000], [null, 0, 60_000]), bothSumMax: 60_000 } },
};
// 住民税: 福山市「所得控除の種類」別表1・2（FUKUYAMA_DED）。旧契約の控除額が28,000円を超える場合は旧契約のみ（上限35,000円）。
export const INSURANCE_RT = {
  life: {
    newTable: T([12_000, 1, 0], [32_000, 0.5, 6_000], [56_000, 0.25, 14_000], [null, 0, 28_000]),
    oldTable: T([15_000, 1, 0], [40_000, 0.5, 7_500], [70_000, 0.25, 17_500], [null, 0, 35_000]),
    bothRule: { oldBasis: 'deduction', oldOver: 28_000 },
    oldOnlyMax: 35_000,
    bothSumMax: 28_000,
    totalMax: 70_000,
  },
  earthquake: {
    quakeTable: T([50_000, 0.5, 0], [null, 0, 25_000]),
    oldLongTable: T([5_000, 1, 0], [15_000, 0.5, 2_500], [null, 0, 10_000]),
    totalMax: 25_000,
  },
};

// ふるさと納税の上限額の目安（一般的な算式。民間サイトの早見表と整合。二次情報）:
//   上限 = 住民税所得割額（調整控除後）×20% ÷（90% − 所得税の限界税率×(1+復興税率)）+ 自己負担2,000円
export const FURUSATO = { specialLimitRate: 0.2, basicRate: 0.1, selfBurden: 2_000 };

// 給与所得者の確定申告の要否（NTA_1900）: 給与の年間収入が2,000万円超、または給与以外の所得（給与・退職を除く）の合計が20万円超（給与1か所の場合）。
// 暗号資産（NTA_CRYPTO_FAQ）。売却・交換・商品購入の利益は原則として雑所得（その他雑所得）。
//  ・年間の収入金額が300万円を超える場合: 帳簿書類の保存あり→原則事業所得、保存なし→雑所得（業務に係る雑所得）（FAQ 2-2）
//  ・雑所得の損失は給与所得など他の所得と通算できない（FAQ 2-11）。暗号資産の証拠金取引は申告分離課税の対象外で総合課税（FAQ 2-12）
//  ・必要経費は譲渡原価と売却時の手数料など（FAQ 2-3）。マイニング・ステーキング等で取得した暗号資産は取得時の時価が収入（FAQ 1-6）
export const CRYPTO = { businessRevenueThreshold: 3_000_000 };

export const FILING_SALARY_EARNER = { salaryRevenueMax: 20_000_000, sideIncomeMax: 200_000 };

export const MEDICAL = {
  // 福山市「所得控除の種類」の医療費控除（10万円または総所得金額等の5%の少ない額、限度額200万円）。所得税でも同じ仕組みだが国税庁の資料は未確認。
  thresholdFixed: 100_000, thresholdRate: 0.05, cap: 2_000_000,
};

// 公的年金等に係る雑所得の速算表（令和2年分以後。NTA_1600）。年金収入 a に対する所得 = floor(a×rate) − sub。
// a ≦ zeroMax は0円。rows は a < lt を満たす最初の行を使う（lt: null は最後の行）。
// tiers は「公的年金等に係る雑所得以外の合計所得金額」の区分（1,000万円以下／2,000万円以下／2,000万円超）。
const R_ = (lt, rate, sub) => ({ lt, rate, sub });
export const PUBLIC_PENSION = {
  source: 'NTA_1600',
  tiers: [
    {
      otherIncomeMax: 10_000_000,
      under65: { zeroMax: 600_000, rows: [R_(1_300_000, 1, 600_000), R_(4_100_000, 0.75, 275_000), R_(7_700_000, 0.85, 685_000), R_(10_000_000, 0.95, 1_455_000), R_(null, 1, 1_950_000)] },
      over65: { zeroMax: 1_100_000, rows: [R_(3_300_000, 1, 1_100_000), R_(4_100_000, 0.75, 275_000), R_(7_700_000, 0.85, 685_000), R_(10_000_000, 0.95, 1_455_000), R_(null, 1, 1_950_000)] },
    },
    {
      otherIncomeMax: 20_000_000,
      under65: { zeroMax: 500_000, rows: [R_(1_300_000, 1, 500_000), R_(4_100_000, 0.75, 175_000), R_(7_700_000, 0.85, 585_000), R_(10_000_000, 0.95, 1_355_000), R_(null, 1, 1_855_000)] },
      over65: { zeroMax: 1_000_000, rows: [R_(3_300_000, 1, 1_000_000), R_(4_100_000, 0.75, 175_000), R_(7_700_000, 0.85, 585_000), R_(10_000_000, 0.95, 1_355_000), R_(null, 1, 1_855_000)] },
    },
    {
      otherIncomeMax: null,
      under65: { zeroMax: 400_000, rows: [R_(1_300_000, 1, 400_000), R_(4_100_000, 0.75, 75_000), R_(7_700_000, 0.85, 485_000), R_(10_000_000, 0.95, 1_255_000), R_(null, 1, 1_755_000)] },
      over65: { zeroMax: 900_000, rows: [R_(3_300_000, 1, 900_000), R_(4_100_000, 0.75, 75_000), R_(7_700_000, 0.85, 485_000), R_(10_000_000, 0.95, 1_255_000), R_(null, 1, 1_755_000)] },
    },
  ],
};
