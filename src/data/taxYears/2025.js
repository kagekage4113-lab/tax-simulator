// 令和7年分（2025年）。docs/tax-sources/ の資料で確認できた値のみ登録している。共通の値は local.js。
// 住民税は「令和7年中の所得に対する令和8年度分」で、福山市の令和8年度の控除額（FUKUYAMA_DED）を使う。
import {
  FUKUYAMA_RESIDENT, FUKUYAMA_RESIDENT_BASIC_R8NENDO, FUKUYAMA_RESIDENT_DEDUCTIONS_R8NENDO, HIROSHIMA_BUSINESS_TAX, MEDICAL,
  NENCHO_BRACKETS, OWNER_COLUMNS, RECON_ADVISORY, SPECIAL_STEPS_IT, SPECIFIC_RELATIVE_IT_STEPS, SRC,
} from './local.js';

export const taxYear2025 = {
  year: 2025,
  label: '令和7年分',
  status: 'partial', // skeleton | partial | confirmed
  sources: [SRC.NTA_R7_P55, SRC.NTA_R8_P3, SRC.NTA_1410, SRC.FUKUYAMA_RATE, SRC.FUKUYAMA_DED, SRC.HIROSHIMA, SRC.SECONDARY_RECON],
  advisories: [RECON_ADVISORY],
  rounding: {
    taxableIncome: { rule: 'floor', unit: 1000, source: 'NTA_R7_P55 p.55 速算表（注）1：課税給与所得金額の1,000円未満の端数は切り捨て（年末調整の算式。確定申告も同様かは未確認）' },
  },
  incomeTax: {
    brackets: NENCHO_BRACKETS, // NTA_R7_P55 p.55。年末調整用の表（確定申告用と同一かは未確認）。18,050,000円超なし
    reconstructionRate: 0.021, // 二次情報（SECONDARY_RECON）
  },
  residentTax: FUKUYAMA_RESIDENT,
  // 給与所得控除 令和7年分（NTA_1410）。収入660万円未満は法令の別表第五で給与所得を求めるため、速算式との差が出る場合がある。
  salaryDeduction: {
    brackets: [
      { upTo: 1_900_000, rate: 0, add: 650_000 },
      { upTo: 3_600_000, rate: 0.3, add: 80_000 },
      { upTo: 6_600_000, rate: 0.2, add: 440_000 },
      { upTo: 8_500_000, rate: 0.1, add: 1_100_000 },
      { upTo: null, rate: 0, add: 1_950_000 },
    ],
    approximate: { from: 0, below: 6_600_000 },
  },
  basicDeduction: {
    // NTA_R7_P55 p.56。合計所得金額による。2,500万円超は適用なし。
    incomeTax: [
      { upTo: 1_320_000, amount: 950_000 },
      { upTo: 3_360_000, amount: 880_000 },
      { upTo: 4_890_000, amount: 680_000 },
      { upTo: 6_550_000, amount: 630_000 },
      { upTo: 23_500_000, amount: 580_000 },
      { upTo: 24_000_000, amount: 480_000 },
      { upTo: 24_500_000, amount: 320_000 },
      { upTo: 25_000_000, amount: 160_000 },
      { upTo: null, amount: 0 },
    ],
    residentTax: FUKUYAMA_RESIDENT_BASIC_R8NENDO,
  },
  medical: MEDICAL,
  socialInsurance: null,
  businessTax: HIROSHIMA_BUSINESS_TAX,
  fx: { incomeTaxRate: null, residentTaxRate: null, carryForwardYears: null },
  deductions: {
    incomeTax: {
      spouse: {
        ownerIncomeLimit: 10_000_000,
        ownerColumns: OWNER_COLUMNS,
        spouseIncomeMax: 580_000, // 令和7年分は58万円以下（NTA_R7_P55 p.55）
        general: [380_000, 260_000, 130_000],
        elder: [480_000, 320_000, 160_000],
        specialSteps: SPECIAL_STEPS_IT,
      },
      dependent: {
        incomeMax: 580_000, // NTA_R8_P3 p.4「改正前」列（令和7年分の要件）
        general: { minAge: 16, amount: 380_000 },
        specific: { minAge: 19, maxAge: 22, amount: 630_000 },
        elder: { minAge: 70, other: 480_000, cohabitingParent: 580_000 },
      },
      specificRelative: {
        incomeMin: 580_000,
        incomeMax: 1_230_000,
        steps: SPECIFIC_RELATIVE_IT_STEPS,
        ageMin: 19, // 年齢要件は福山市（住民税）の資料の定義。国税庁の資料では未確認
        ageMax: 22,
      },
      disability: { general: 270_000, special: 400_000, specialCohabiting: 750_000 },
      widow: 270_000,
      singleParent: 350_000,
      widowSingleParentIncomeMax: 5_000_000, // 福山市の資料の要件。所得税側は国税庁の資料で未確認
      workingStudent: { amount: 270_000, incomeMax: 850_000 }, // NTA_R8_P3 p.4「改正前」列
    },
    residentTax: FUKUYAMA_RESIDENT_DEDUCTIONS_R8NENDO,
  },
  walls: [],
  unverified: [
    '復興特別所得税の率・適用期間（2.1%は二次情報。国税庁の原本未確認）',
    '所得税の税率表：18,050,000円超の区分、および確定申告用の速算表が年末調整用と同一か',
    '給与所得控除：収入660万円未満は別表第五による金額との差が出る場合がある（別表の資料なし）',
    '所得税・住民税の端数処理（税額の100円未満切捨など。課税所得の1,000円未満切捨は年末調整の算式として確認）',
    '特定親族の年齢要件（住民税の資料の定義を所得税にも適用。国税庁の資料は未確認）',
    'ひとり親・寡婦控除の所得要件（住民税の資料の要件を所得税にも適用）',
    '所得税の勤労学生控除・扶養親族等の所得要件は、令和8年分資料の「改正前」列から令和7年分に適用',
    '個人事業税の端数処理・月割適用・事業の種類ごとの業種一覧・損失繰越',
    '住民税の調整控除、非課税判定、国外居住親族・16歳未満の扱い',
    'FXの税率・繰越控除の年またぎの扱い',
    '社会保険料の概算率',
  ],
};
