// 令和7年分（2025年）。docs/tax-sources/ の資料で確認できた値のみ登録している。共通の値は local.js。
// 住民税は「令和7年中の所得に対する令和8年度分」で、福山市の令和8年度の控除額（FUKUYAMA_DED）を使う。
import {
  FUKUYAMA_RESIDENT, FUKUYAMA_RESIDENT_BASIC_R8NENDO, FUKUYAMA_RESIDENT_DEDUCTIONS_R8NENDO, FX, HIROSHIMA_BUSINESS_TAX, MEDICAL,
  INCOME_TAX_BRACKETS, OWNER_COLUMNS, RECON_RATE, SPECIAL_STEPS_IT, SPECIFIC_RELATIVE_IT_STEPS, SRC,
} from './local.js';
import { KYOKAI_KENPO_2025 } from './kyokaiKenpo.js';

export const taxYear2025 = {
  year: 2025,
  label: '令和7年分',
  status: 'partial', // skeleton | partial | confirmed
  sources: [SRC.NTA_R7_P55, SRC.NTA_R8_P3, SRC.NTA_1410, SRC.FUKUYAMA_RATE, SRC.FUKUYAMA_DED, SRC.FUKUYAMA_ADJ, SRC.HIROSHIMA, SRC.NTA_1521, SRC.NTA_1522, SRC.NTA_1523, SRC.NTA_2260, SRC.FUKUYAMA_DIFF, SRC.KYOKAI_R7_HIROSHIMA, SRC.KYOKAI_R7_TOKYO, SRC.KYOKAI_R7_OSAKA],
  advisories: [
    '令和7年分の社会保険料は協会けんぽの令和7年3月分からの料率を12か月分に当てはめた概算です（1〜2月の旧料率、賞与は未反映。実額を入力すると置き換わります）。',
  ],
  rounding: {
    taxableIncome: { rule: 'floor', unit: 1000, source: 'NTA_2260：課税される所得金額は1,000円未満の端数を切り捨てた後の金額' },
  },
  incomeTax: {
    brackets: INCOME_TAX_BRACKETS, // NTA_2260（確定申告用・全区分）。年末調整用の表（NTA_R7_P55）とも一致
    reconstructionRate: RECON_RATE, // NTA_1521
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
  // 社会保険料の概算（協会けんぽ・会社員）。国保・国民年金は自治体別のためフェーズ4。雇用保険料は未登録。
  socialInsurance: { estimate: { employee: KYOKAI_KENPO_2025 } },
  businessTax: HIROSHIMA_BUSINESS_TAX,
  fx: FX, // NTA_1521
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
    '復興特別所得税：令和9年分以後（1.1%＋防衛特別所得税1%）は対象外',
    '所得税：基準所得金額3億3,000万円超の特例（NTA_2260 ※1）は対象外',
    '給与所得控除：収入660万円未満は別表第五による金額との差が出る場合がある（別表の資料なし）',
    '所得税・住民税の税額の端数処理（100円未満切捨など。課税所得の1,000円未満切捨は確認済み）',
    '特定親族の年齢要件（住民税の資料の定義を所得税にも適用。国税庁の資料は未確認）',
    'ひとり親・寡婦控除の所得要件（住民税の資料の要件を所得税にも適用）',
    '所得税の勤労学生控除・扶養親族等の所得要件は、令和8年分資料の「改正前」列から令和7年分に適用',
    '個人事業税の端数処理・月割適用・事業の種類ごとの業種一覧・損失繰越',
    '住民税の非課税判定、国外居住親族・16歳未満の扱い',
    'FX・先物：繰越控除の要件（連続した付表付き確定申告）は注記のみで、実際に満たしているかは確認しない。実物の受渡しになる取引・暗号資産のデリバティブは分離課税の対象外',
    '暗号資産：雑所得（総合課税）として扱う前提（国税庁の資料は未確認）',
    '社会保険料：国民健康保険・国民年金・雇用保険、協会けんぽの他支部（資料のない都道府県は登録済み支部の平均で概算）、賞与',
    '住民税の調整控除：ひとり親は性別の入力がないため男性の差額（1万円）で計算。非課税判定は未反映',
  ],
};
