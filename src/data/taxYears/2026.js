// 令和8年分（2026年）。フェーズ1では構造のみで、税率・控除額は未登録。
// フェーズ2で国税庁等の公的資料（PDF/URL）を確認した値のみを sources 付きで登録する。
export const taxYear2026 = {
  year: 2026,
  label: '令和8年分',
  status: 'skeleton', // skeleton | partial | confirmed
  // 登録した値ごとに { url, localFile(docs/tax-sources/), retrievedAt, effectiveFrom } を記録する。
  sources: [],
  // 端数処理の根拠は税目ごとにここへ記録する（2.3）。
  // 形は src/calc/engine.js 冒頭を参照。例: taxableIncome: { rule: 'floor', unit: 1000 }（出典を併記して登録）
  rounding: {},
  incomeTax: { brackets: null, reconstructionRate: null },
  residentTax: { incomeRate: null, perCapita: null },
  salaryDeduction: null,
  basicDeduction: null,
  medical: null,
  socialInsurance: null,
  deductions: {}, // deductionId -> 年度別の金額・条件
  businessTax: null,
  fx: { incomeTaxRate: null, residentTaxRate: null, carryForwardYears: null },
  walls: [], // 6.4 の「壁」: { id, label, threshold, source, condition }
  unverified: [
    '所得税の税率区分・速算表',
    '給与所得控除（令和7年度改正後の最低保障額）',
    '基礎控除（令和7年度改正後の段階）',
    '配偶者控除・配偶者特別控除',
    '扶養控除・特定親族特別控除',
    '障害者控除・寡婦控除・ひとり親控除・勤労学生控除（所得税・住民税）',
    '住民税の税率・均等割・非課税ライン',
    '個人事業税の事業主控除・税率・対象業種',
    '社会保険料の概算率',
    'FXの税率・繰越控除の年またぎの扱い',
  ],
};
