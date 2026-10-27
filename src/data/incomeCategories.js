// 収入区分の「枠」。課税方式・計算モジュールを設定データとして持つ。
// supportPhase: その区分の税計算を実装するフェーズ。computeModule は実装時に対応する計算モジュール名。
// 実装前の区分（supported: false）は所得金額を直接入力する「簡易扱い」とする。

export const TAX_METHOD = {
  COMPREHENSIVE: 'comprehensive', // 総合課税
  SEPARATE: 'separate', // 申告分離課税
  WITHHOLDING: 'withholding', // 源泉分離など
};

export const TAX_METHOD_LABEL = {
  comprehensive: '総合課税',
  separate: '申告分離課税',
  withholding: '源泉分離など',
};

export const INCOME_CATEGORIES = [
  {
    id: 'salary',
    label: '給与収入',
    taxMethod: TAX_METHOD.COMPREHENSIVE,
    computeModule: 'salaryIncome', // 給与所得控除を適用
    inputKind: 'revenue', // 収入のみ（経費入力なし：特定支出控除は未対応）
    hasExpenses: false,
    supportPhase: 2,
    supported: true,
  },
  {
    id: 'business',
    label: '事業収入',
    taxMethod: TAX_METHOD.COMPREHENSIVE,
    computeModule: 'businessIncome', // 収入−経費、青色特別控除
    inputKind: 'revenue',
    hasExpenses: true,
    supportPhase: 2,
    supported: true,
  },
  {
    id: 'realEstate',
    label: '不動産収入',
    taxMethod: TAX_METHOD.COMPREHENSIVE,
    computeModule: 'realEstateIncome',
    inputKind: 'revenue',
    hasExpenses: true,
    supportPhase: 2,
    supported: true,
  },
  {
    id: 'misc',
    label: '雑所得（副業・暗号資産など）',
    taxMethod: TAX_METHOD.COMPREHENSIVE,
    computeModule: 'miscIncome',
    inputKind: 'revenue',
    hasExpenses: true,
    supportPhase: 2,
    supported: true,
  },
  {
    id: 'crypto',
    label: '暗号資産（雑所得）',
    taxMethod: TAX_METHOD.COMPREHENSIVE,
    computeModule: 'miscIncome', // 雑所得として総合課税。雑所得の赤字は他の所得と通算しない（雑所得内では通算する）
    inputKind: 'revenue',
    hasExpenses: true,
    supportPhase: 2,
    supported: true,
  },
  {
    id: 'fx',
    label: 'FX・先物・オプション取引（申告分離）',
    taxMethod: TAX_METHOD.SEPARATE,
    computeModule: 'fxIncome',
    // 年間損益（経費控除後）を実額で入力する。損失はマイナスで入力。
    inputKind: 'profit',
    hasExpenses: false,
    supportPhase: 2,
    supported: true,
  },
  {
    id: 'listedStock',
    label: '上場株式等の譲渡益・配当（申告分離）',
    taxMethod: TAX_METHOD.SEPARATE,
    computeModule: 'separatePool', // 所得税15%＋住民税5%。損失は同区分内で通算し、3年繰越
    // 年間の損益（取得費・手数料等を控除後）を実額で入力する。損失はマイナスで入力。
    inputKind: 'profit',
    hasExpenses: false,
    supportPhase: 4,
    supported: true,
  },
  {
    id: 'securities',
    label: 'その他の株式等（一般株式等など・簡易扱い）',
    taxMethod: TAX_METHOD.SEPARATE,
    computeModule: null,
    inputKind: 'directIncome',
    hasExpenses: false,
    supportPhase: 4,
    supported: false,
  },
  {
    id: 'other',
    label: 'その他の所得',
    taxMethod: null, // ユーザーが選ぶ
    computeModule: null,
    inputKind: 'directIncome',
    hasExpenses: false,
    supportPhase: null,
    supported: false,
  },
];

export const getIncomeCategory = (id) => INCOME_CATEGORIES.find((c) => c.id === id) || null;
