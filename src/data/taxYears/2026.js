// 令和8年分（2026年）。docs/tax-sources/ の資料で確認できた値のみ登録している。
// 資料にない項目は null のままにし、unverified に記録する（推測で埋めない）。
// 令和8年度税制改正（基礎控除の引上げ等）は令和8年12月1日施行・令和8年分以後の所得税に適用（NTA_P3 p.3）。
const NTA_P3 = { id: 'NTA_P3', title: '令和8年分 年末調整のしかた（国税庁） 3〜4ページ「昨年と比べて変わった点」', localFile: 'docs/tax-sources/2026_nencho-guide_nta_p3-4_changes.pdf' };
const NTA_P55 = { id: 'NTA_P55', title: '令和8年分 年末調整のしかた（国税庁） 55〜56ページ「速算表」「参考」各控除額の表', localFile: 'docs/tax-sources/2026_nencho-guide_nta_p55-56_tables.pdf' };
const FUKUYAMA = { id: 'FUKUYAMA', title: '福山市「個人市民税の納税義務者と税額の計算方法・税率等について」（ページ掲載日2024年6月10日更新、2026-10-27印刷）', url: 'https://www.city.fukuyama.hiroshima.jp/soshiki/shiminzei/2179.html', localFile: 'docs/tax-sources/fukuyama_resident-tax_printed-2026-10-27.pdf' };
const HIROSHIMA = { id: 'HIROSHIMA', title: '広島県「個人事業税について」（掲載日2025年4月1日、2026-10-27印刷）', url: 'https://www.pref.hiroshima.lg.jp/site/zei/1170306367409.html', localFile: 'docs/tax-sources/hiroshima_business-tax_printed-2026-10-27.pdf' };

// 配偶者控除・配偶者特別控除の金額 [所得者の合計所得 900万以下, 950万以下, 1000万以下]
const SPOUSE_COLS = [9_000_000, 9_500_000, 10_000_000];

export const taxYear2026 = {
  year: 2026,
  label: '令和8年分',
  status: 'partial', // skeleton | partial | confirmed
  sources: [NTA_P3, NTA_P55, FUKUYAMA, HIROSHIMA],
  // 端数処理（根拠が資料にあるものだけ）。未登録の端数処理は「端数処理なしの概算」として計算し注記する。
  rounding: {
    taxableIncome: { rule: 'floor', unit: 1000, source: 'NTA_P55 p.55 速算表（注）1：課税給与所得金額の1,000円未満の端数は切り捨て（年末調整の算式。確定申告も同様かは未確認）' },
  },
  incomeTax: {
    // 令和8年分の年末調整のための算出所得税額の速算表（NTA_P55 p.55）。課税給与所得金額18,050,000円まで。
    // 確定申告の速算表（国税庁 No.2260）と同一かは未確認。18,050,000円超の区分は資料なし。
    brackets: [
      { upTo: 1_950_000, rate: 0.05, deduction: 0 },
      { upTo: 3_300_000, rate: 0.1, deduction: 97_500 },
      { upTo: 6_950_000, rate: 0.2, deduction: 427_500 },
      { upTo: 9_000_000, rate: 0.23, deduction: 636_000 },
      { upTo: 18_000_000, rate: 0.33, deduction: 1_536_000 },
      { upTo: 18_050_000, rate: 0.4, deduction: 2_796_000 },
    ],
    reconstructionRate: null, // 資料なし
  },
  // 住民税は福山市（広島県）の値。自治体で異なる（NTA資料ではない）。
  residentTax: {
    scope: '福山市（広島県）',
    incomeRate: 0.1, // 所得割：市民税6%＋県民税4%（FUKUYAMA）
    perCapita: 5_500, // 均等割4,500円（市3,000＋県1,500、ひろしまの森づくり県民税500円を含む）＋森林環境税1,000円（FUKUYAMA）
    // 非課税の目安（FUKUYAMA。前年の合計所得金額が (本人＋扶養人数)×35万円＋10万円＋21万円 以下は均等割・所得割とも非課税 等）。壁表示（フェーズ3）で使用予定。
    nonTaxable: { perPerson: 350_000, base: 100_000, addIfDependents: { allIncome: 210_000, incomeLevy: 320_000 } },
  },
  // 給与所得控除：令和8・9年分（NTA_P3 p.3 (2)）。収入220万円以下の範囲のみ。
  // 220万円超は「改正なし」とのみ記載され、金額の資料がない → engine は 2,200,000円超を「未登録」として扱う。
  salaryDeduction: {
    brackets: [{ upTo: 2_200_000, rate: 0, add: 740_000 }],
  },
  // 基礎控除（所得税）令和8年分（NTA_P55 p.56、NTA_P3 p.3 (1)）。合計所得金額による。2,500万円超は適用なし。
  basicDeduction: {
    incomeTax: [
      { upTo: 4_890_000, amount: 1_040_000 },
      { upTo: 6_550_000, amount: 670_000 },
      { upTo: 23_500_000, amount: 620_000 },
      { upTo: 24_000_000, amount: 480_000 },
      { upTo: 24_500_000, amount: 320_000 },
      { upTo: 25_000_000, amount: 160_000 },
      { upTo: null, amount: 0 },
    ],
    residentTax: null, // 資料なし
  },
  medical: null,
  socialInsurance: null,
  // 個人事業税（広島県 HIROSHIMA）。税率は事業の種類別。事業主控除は年290万円（月割あり・未対応）。
  // 所得税の青色申告特別控除は適用されない（HIROSHIMA p.9）。
  businessTax: {
    scope: '広島県',
    mainDeduction: 2_900_000,
    blueDeductionApplies: false,
    rates: { type1: 0.05, type2: 0.04, type3: 0.05, type3b: 0.03 },
  },
  fx: { incomeTaxRate: null, residentTaxRate: null, carryForwardYears: null },
  // 所得控除の自動計算に使う年度別データ（所得税のみ。住民税の控除額は資料なし）
  deductions: {
    incomeTax: {
      spouse: {
        ownerIncomeLimit: 10_000_000, // 所得者の合計所得金額が1,000万円超は配偶者控除・配偶者特別控除なし（NTA_P55 注1）
        ownerColumns: SPOUSE_COLS,
        // 配偶者控除（配偶者の合計所得金額62万円以下）
        spouseIncomeMax: 620_000,
        general: [380_000, 260_000, 130_000],
        elder: [480_000, 320_000, 160_000], // 老人控除対象配偶者
        // 配偶者特別控除（配偶者の合計所得金額が62万円超）。upTo 以下
        specialSteps: [
          { upTo: 950_000, amounts: [380_000, 260_000, 130_000] },
          { upTo: 1_000_000, amounts: [360_000, 240_000, 120_000] },
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
        incomeMax: 620_000, // 扶養親族の合計所得金額要件（NTA_P3 p.4）
        general: { minAge: 16, amount: 380_000 }, // 16歳以上（平成23年1月1日以前生）
        specific: { minAge: 19, maxAge: 22, amount: 630_000 }, // 19歳以上23歳未満
        elder: { minAge: 70, other: 480_000, cohabitingParent: 580_000 }, // 同居老親等は580,000円
      },
      // 特定親族特別控除：特定親族の合計所得金額が62万円超123万円以下（NTA_P55 p.56 / NTA_P3 p.4）
      specificRelative: {
        incomeMin: 620_000,
        incomeMax: 1_230_000,
        steps: [
          { upTo: 850_000, amount: 630_000 },
          { upTo: 900_000, amount: 610_000 },
          { upTo: 950_000, amount: 510_000 },
          { upTo: 1_000_000, amount: 410_000 },
          { upTo: 1_050_000, amount: 310_000 },
          { upTo: 1_100_000, amount: 210_000 },
          { upTo: 1_150_000, amount: 110_000 },
          { upTo: 1_200_000, amount: 60_000 },
          { upTo: 1_230_000, amount: 30_000 },
        ],
        ageMin: null, // 「特定親族」の年齢要件は資料に明記なし → 未確認
        ageMax: null,
      },
      disability: { general: 270_000, special: 400_000, specialCohabiting: 750_000 },
      widow: 270_000,
      singleParent: 350_000, // 所得要件は資料になし → ユーザー申告として扱う
      workingStudent: { amount: 270_000, incomeMax: 890_000 }, // 合計所得金額89万円以下（NTA_P3 p.4）
    },
    residentTax: null, // 資料なし
  },
  walls: [],
  unverified: [
    '所得税の復興特別所得税の率・適用期間',
    '給与所得控除（収入220万円超。「改正なし」とのみ記載）',
    '所得税の税率表：18,050,000円超の区分、および確定申告用の速算表が年末調整用と同一か',
    '所得税・住民税の端数処理（税額の100円未満切捨など。課税所得の1,000円未満切捨は年末調整の算式として確認）',
    '住民税の所得控除額（基礎控除・配偶者・扶養・障害者など）。住民税の基礎控除（令和8年度以降）',
    '住民税：令和8年度（2026年度）の税制改正の反映（福山市ページの更新日は2024年6月）',
    '特定親族特別控除の対象となる「特定親族」の年齢要件',
    'ひとり親控除・寡婦控除の所得要件',
    '個人事業税の端数処理・月割適用・事業の種類ごとの業種一覧（広島県の資料）',
    '医療費控除の足切り・上限',
    'FXの税率・繰越控除の年またぎの扱い',
    '社会保険料の概算率',
  ],
};
