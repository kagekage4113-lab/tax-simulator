// 令和7年分（2025年）。docs/tax-sources/ の資料で確認できた値のみ登録している。共通の値は local.js。
// 住民税は「令和7年中の所得に対する令和8年度分」で、東京23区の令和8年度の控除額を使う。
import {
  CASUALTY, LISTED, TOKYO23_RESIDENT, RESIDENT_BASIC_R8NENDO, RESIDENT_DEDUCTIONS_R8NENDO, CRYPTO, FILING_SALARY_EARNER, TOKYO23_KOKUHO, FURUSATO, FX, TOKYO_BUSINESS_TAX, INSURANCE_IT_2025, INSURANCE_RT, MEDICAL,
  INCOME_TAX_BRACKETS, OWNER_COLUMNS, PUBLIC_PENSION, RECON_RATE, SALARY_ADJUSTMENT, SPECIAL_STEPS_IT, SPECIFIC_RELATIVE_IT_STEPS, SRC,
} from './local.js';
import { KYOKAI_KENPO_2025 } from './kyokaiKenpo.js';

export const taxYear2025 = {
  year: 2025,
  label: '令和7年分',
  status: 'partial', // skeleton | partial | confirmed
  sources: [SRC.KYOKAI_ALL, SRC.KITA_MEASURE, SRC.TSUYAMA_ADJ, SRC.NTA_1411, SRC.SOUMU_R4_ISSUES, SRC.NTA_FORM_T3, SRC.NTA_1160, SRC.NTA_1171, SRC.NTA_1600, SRC.NTA_R7_P55, SRC.NTA_R8_P3, SRC.NTA_1410, SRC.HIROSHIMA, SRC.NTA_1521, SRC.NTA_1522, SRC.NTA_1523, SRC.NTA_1525, SRC.NTA_CRYPTO_FAQ, SRC.NTA_1110, SRC.NTA_STOCKS, SRC.NTA_1250, SRC.NTA_1900, SRC.NTA_INSURANCE, SRC.NTA_1535, SRC.SECONDARY_FURUSATO, SRC.NTA_2260, SRC.NENKIN_PREMIUM, SRC.SECONDARY_KOKUHO_REDUCTION, SRC.TOKYO23_BOOKLET, SRC.TOKUBETSUKU_KOKUHO_R7, SRC.KYOKAI_TOKYO, SRC.NTA_GLOSSARY, SRC.CHIHOZEI_314_6, SRC.KYOKAI_R7_HIROSHIMA, SRC.KYOKAI_R7_TOKYO, SRC.KYOKAI_R7_OSAKA],
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
  residentTax: TOKYO23_RESIDENT,
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
    residentTax: RESIDENT_BASIC_R8NENDO,
  },
  medical: MEDICAL,
  // 社会保険料の概算。会社員=協会けんぽ、個人事業主=東京23区の国保料＋国民年金（国民年金は未登録）。雇用保険料は未登録。
  socialInsurance: { estimate: { employee: KYOKAI_KENPO_2025, national: TOKYO23_KOKUHO } },
  businessTax: TOKYO_BUSINESS_TAX,
  publicPension: PUBLIC_PENSION, // NTA_1600
  salaryAdjustment: SALARY_ADJUSTMENT, // NTA_1411（所得税）・津山市（住民税。算式は同じ）
  fx: FX, // NTA_1521
  filing: { salaryEarner: FILING_SALARY_EARNER }, // NTA_1900
  crypto: CRYPTO, // NTA_CRYPTO_FAQ
  casualty: CASUALTY, // NTA_1110
  listed: LISTED, // NTA_STOCKS
  furusato: FURUSATO, // 二次情報
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
        ageMin: 19, // 年齢要件は東京23区の住民税のパンフレットの定義（TOKYO23_BOOKLET）。国税庁の資料では未確認
        ageMax: 22,
      },
      disability: { general: 270_000, special: 400_000, specialCohabiting: 750_000 },
      widow: 270_000,
      singleParent: 350_000,
      widowSingleParentIncomeMax: 5_000_000, // 合計所得金額500万円以下（NTA_1171。住民税側は未確認）
      singleParentChildIncomeMax: 580_000, // ひとり親の子の総所得金額等の基準（NTA_1171：令和7年分58万円、令和8年分62万円）
      insurance: INSURANCE_IT_2025, // NTA_INSURANCE
      workingStudent: { amount: 270_000, incomeMax: 850_000 }, // NTA_R8_P3 p.4「改正前」列
    },
    residentTax: { ...RESIDENT_DEDUCTIONS_R8NENDO, insurance: INSURANCE_RT },
  },
  walls: [],
  unverified: [
    '復興特別所得税：令和9年分以後（1.1%＋防衛特別所得税1%）は対象外',
    '所得税：基準所得金額3億3,000万円超の特例（NTA_2260 ※1）は対象外',
    '給与所得控除：収入660万円未満は別表第五による金額との差が出る場合がある（別表の資料なし）',
    '所得税・住民税の税額の端数処理（100円未満切捨など。課税所得の1,000円未満切捨は確認済み）',
    '特定親族の年齢要件（住民税の資料の定義を所得税にも適用。国税庁の資料は未確認）',
    '総合課税の所得から引ききれない所得控除を、FX・先物（分離課税）の所得から差し引く扱い：申告書第三表の様式（所得から差し引かれる金額を各分離課税の所得に振り分ける欄）で構造を確認。手引きの文章による裏づけと、差し引く順序（様式は上場株式等→先物取引の順。税率が同じため税額は変わらない）は未確認。住民税側の資料は未確認',
    '東京23区の国民健康保険料：令和7年度の特別区の標準的な料率（16区が同一）を使用。令和8年度の料率（子ども・子育て支援金分を含む）・端数処理・区ごとの差（中野区・江戸川区など）は未反映',
    '東京都の個人事業税：広島県の資料の標準税率・事業主控除を準用（東京都の資料は未入手）',
    '住民税の所得割の調整措置（逆転防止）：東京都北区の公表式で反映（他区の条例は未確認）。式の（A）は北区のページでは「+32万円」を常に加える書き方だが、非課税の基準（扶養がいなければ加算なし）と同じものとして計算している',
    '所得金額調整控除：子ども・特別障害者等を有する者等の控除は所得税・住民税とも反映（住民税側は津山市の公式ページで算式の同一を確認）。給与所得と年金所得の双方を有する者の控除は入力欄がないため未対応',
    '寡婦控除の自動判定（国税庁 No.1170 は保管のみ。「夫」との離婚・死別などの要件は未実装。手入力の選択のみ）',
    '公的年金等控除：年金以外の所得はない前提（1,000万円以下の区分）で計算。遺族年金・個人年金など公的年金等以外は対象外',
    '任意継続の健康保険：保険料は本人の入力値（標準報酬月額の上限・料率からの概算は未対応）',
    '所得税の勤労学生控除・扶養親族等の所得要件は、令和8年分資料の「改正前」列から令和7年分に適用',
    '個人事業税の端数処理・月割適用・事業の種類ごとの業種一覧・損失繰越',
    '住民税の非課税判定、国外居住親族・16歳未満の扱い',
    '保険料控除：控除額の1円未満の端数は切上げで計算（国税庁の資料に端数処理の記載なし）。23歳未満の扶養親族の特例は所得税のみ（住民税側の資料なし）',
    'ふるさと納税：上限額は一般的な算式による目安（二次情報）。総務省の公式資料は未確認。住宅ローン控除（住民税側）・セルフメディケーション税制・分離課税は考慮しない',
    '住宅ローン控除：自動計算は行わない（区分が多く確定申告書等作成コーナーが自動計算するため、手入力の税額控除を使用）。所得税から引ききれない分の住民税からの控除は未反映',
    '配当控除（総合課税を選択した配当）・雑損失の繰越控除・災害減免法との選択・上場株式等以外の株式等（一般株式等）の課税は未対応',
    'FX・先物：繰越控除の要件（連続した付表付き確定申告）は注記のみで、実際に満たしているかは確認しない。実物の受渡しになる取引・暗号資産のデリバティブは分離課税の対象外',
    '暗号資産：根拠のFAQは令和4年12月現在の法令等。その後の改正の有無は未確認。取得価額の計算（総平均法・移動平均法）・事業所得への区分は入力側で行う（損益は経費控除後の実額を入力）',
    '社会保険料：国保の法定軽減の公的資料（二次情報で登録）、令和7年度の国民年金額、雇用保険、協会けんぽの令和7年度の料率（47支部のうち3支部＋7支部のみ確定。他は令和8年度の料率で代用して注記）、賞与',
    '住民税の調整控除：ひとり親は性別の入力がないため男性の差額（1万円）で計算',
    '住民税の配偶者特別控除・特定親族特別控除の段階額、寡婦・ひとり親控除の額、人的控除額の差額表：地方税法による全国共通の値を登録している。東京23区のパンフレットでは最高額までしか確認できていない',
  ],
};
