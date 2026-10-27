// テスト専用の架空の税制データ。実際の税法の値ではない。
// 手計算しやすい切りのよい数字にしてあり、エンジンのロジック（順序・端数・通算・分離）だけを検証する。
export const syntheticRules = {
  year: 9999,
  rounding: {
    taxableIncome: { rule: 'floor', unit: 1000 },
    residentTaxableIncome: { rule: 'floor', unit: 1000 },
    incomeTax: { rule: 'floor', unit: 100 },
    reconstruction: { rule: 'floor', unit: 1 },
    residentIncomeLevy: { rule: 'floor', unit: 100 },
    businessTax: { rule: 'floor', unit: 100 },
  },
  incomeTax: {
    brackets: [
      { upTo: 1_000_000, rate: 0.1, deduction: 0 },
      { upTo: 3_000_000, rate: 0.2, deduction: 100_000 },
      { upTo: null, rate: 0.3, deduction: 400_000 },
    ],
    reconstructionRate: 0.02,
  },
  residentTax: { incomeRate: 0.1, perCapita: 5_000 },
  salaryDeduction: {
    brackets: [
      { upTo: 1_000_000, rate: 0, add: 400_000 },
      { upTo: 3_000_000, rate: 0.2, add: 200_000 },
      { upTo: null, rate: 0.1, add: 500_000 },
    ],
  },
  basicDeduction: {
    incomeTax: [{ upTo: 24_000_000, amount: 480_000 }, { upTo: null, amount: 0 }],
    residentTax: [{ upTo: 24_000_000, amount: 430_000 }, { upTo: null, amount: 0 }],
  },
  medical: { thresholdFixed: 100_000, thresholdRate: 0.05, cap: 2_000_000 },
  socialInsurance: {
    estimate: {
      employee: { rate: 0.15, base: 'salaryRevenue' },
      national: { rate: 0.1, base: 'totalIncome' },
    },
  },
  businessTax: { rate: 0.05, mainDeduction: 3_000_000 },
  fx: { incomeTaxRate: 0.15, residentTaxRate: 0.05 },
};
