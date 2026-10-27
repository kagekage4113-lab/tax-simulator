// 控除の設定データ。控除の種類を計算関数にハードコードしないため、
// 入力方式・所得税/住民税別の扱い・適用条件をここで持つ。
// 金額・閾値は「令和7年分」等の公的資料で確認してから taxYears/ 側に登録する（フェーズ2）。
// ここでは構造のみ。amountRef は taxYears 内のどのキーを参照するかを示す予定地。
//
// inputMode:
//   'auto'   条件から計算（上書き可）
//   'manual' 控除額（または基となる額）をユーザーが入力
//   'manual+calc' 基礎となる額を入力し控除額を計算（医療費控除）
// phase: 実装フェーズ（auto/manual いずれの場合も、そのフェーズで計算に反映）
// supported: false の控除は「未対応」と表示し、自動適用しない

const both = { applies: true };
const none = { applies: false };

export const INCOME_DEDUCTIONS = [
  { id: 'basic', label: '基礎控除', inputMode: 'auto', phase: 2, incomeTax: both, residentTax: both, supported: true,
    condition: '合計所得金額に応じて段階がある（所得税と住民税で金額が異なる）' },
  { id: 'spouse', label: '配偶者控除・配偶者特別控除', inputMode: 'auto', phase: 2, incomeTax: both, residentTax: both, supported: true,
    condition: '本人と配偶者の合計所得金額で金額が決まる' },
  { id: 'dependent', label: '扶養控除（一般・特定・老人・同居老親等）', inputMode: 'auto', phase: 2, incomeTax: both, residentTax: both, supported: true,
    condition: '年齢・同居の有無・所得で区分' },
  { id: 'specificRelative', label: '特定親族特別控除', inputMode: 'auto', phase: 2, incomeTax: both, residentTax: both, supported: true, needsVerification: true,
    condition: '令和7年度改正で新設。対象年・要件・金額を公的資料で確認してから実装' },
  { id: 'disability', label: '障害者控除（一般／特別／同居特別）', inputMode: 'auto', phase: 2, incomeTax: both, residentTax: both, supported: true,
    condition: '本人・同一生計配偶者・扶養親族のそれぞれが対象。所得税と住民税で金額が異なる。適用はユーザーの申告に基づく' },
  { id: 'widowSingleParent', label: '寡婦控除・ひとり親控除', inputMode: 'auto', phase: 2, incomeTax: both, residentTax: both, supported: true,
    condition: '婚姻状況・扶養する子の有無・所得で判定' },
  { id: 'workingStudent', label: '勤労学生控除', inputMode: 'auto', phase: 2, incomeTax: both, residentTax: both, supported: true,
    condition: '所得要件あり' },
  { id: 'socialInsurance', label: '社会保険料控除', inputMode: 'auto', phase: 2, incomeTax: both, residentTax: both, supported: true,
    condition: '社会保険料（概算または実額）を使用' },
  { id: 'smallBusinessMutualAid', label: '小規模企業共済等掛金控除（iDeCo・小規模企業共済など）', inputMode: 'manual', phase: 2, incomeTax: both, residentTax: both, supported: true,
    condition: '掛金の年間合計を入力' },
  { id: 'lifeInsurance', label: '生命保険料控除', inputMode: 'manual', phase: 2, autoPhase: 4, incomeTax: both, residentTax: both, supported: true,
    condition: '計算式が複雑なため控除額を直接入力（自動計算はフェーズ4）' },
  { id: 'earthquakeInsurance', label: '地震保険料控除', inputMode: 'manual', phase: 2, autoPhase: 4, incomeTax: both, residentTax: both, supported: true,
    condition: '控除額を直接入力（自動計算はフェーズ4）' },
  { id: 'medical', label: '医療費控除', inputMode: 'manual+calc', phase: 2, incomeTax: both, residentTax: both, supported: true,
    condition: '支払額と補填額を入力して控除額を計算。セルフメディケーション税制との選択は未対応',
    fields: [{ key: 'paid', label: '支払った医療費' }, { key: 'reimbursed', label: '補填される金額（保険金など）' }] },
  { id: 'donation', label: '寄附金控除（ふるさと納税など）', inputMode: 'manual', phase: 2, incomeTax: both, residentTax: both, supported: true,
    condition: '住民税側の特例分は税額控除と合わせて扱う。上限額の推定はフェーズ4' },
  { id: 'casualty', label: '雑損控除', inputMode: 'manual', phase: 4, incomeTax: both, residentTax: both, supported: false,
    condition: '災害・盗難・横領による損失（フェーズ4）' },
  { id: 'otherIncomeDeduction', label: 'その他の所得控除', inputMode: 'manual', phase: 2, incomeTax: both, residentTax: both, supported: true,
    condition: '未対応の控除を控除額として直接入力する枠' },
];

export const TAX_CREDITS = [
  { id: 'housingLoan', label: '住宅借入金等特別控除（住宅ローン控除）', inputMode: 'manual', phase: 2, incomeTax: both, residentTax: none, supported: true,
    condition: '税額控除。手入力（自動計算はフェーズ4）' },
  { id: 'donationCredit', label: '寄附金に係る税額控除（ふるさと納税など）', inputMode: 'manual', phase: 2, incomeTax: none, residentTax: both, supported: true,
    condition: '手入力。上限額の推定はフェーズ4' },
  { id: 'dividendCredit', label: '配当控除', inputMode: 'auto', phase: 4, incomeTax: both, residentTax: both, supported: false,
    condition: '株式等の収入区分と同時にフェーズ4' },
  { id: 'foreignTaxCredit', label: '外国税額控除', inputMode: 'manual', phase: null, incomeTax: both, residentTax: both, supported: false,
    condition: '未対応' },
];

export const getDeduction = (id) => INCOME_DEDUCTIONS.find((d) => d.id === id) || null;
export const getTaxCredit = (id) => TAX_CREDITS.find((d) => d.id === id) || null;

// 手入力を受け付ける控除・税額控除（入力欄を出す対象）
export const MANUAL_DEDUCTIONS = INCOME_DEDUCTIONS.filter((d) => d.inputMode.startsWith('manual'));
export const MANUAL_TAX_CREDITS = TAX_CREDITS.filter((d) => d.inputMode === 'manual');
