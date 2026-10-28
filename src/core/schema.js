// 入力データ（state）のスキーマ・初期値・検証・マイグレーション。
// 画面・計算から独立。外部入力（localStorage / JSON）は必ず validateState を通す。
import { INCOME_CATEGORIES, getIncomeCategory } from '../data/incomeCategories.js';
import { MANUAL_DEDUCTIONS, MANUAL_TAX_CREDITS } from '../data/deductions.js';
import { AREAS, DEFAULT_AREA, SUPPORTED_YEARS, DEFAULT_YEAR } from '../data/taxYears/index.js';
import { MAX_YEN } from './money.js';
import { newId } from './ids.js';
import { defaultHousehold, validateHousehold } from './household.js';

export const DATA_VERSION = 1;
export const APP_ID = 'tax-simulator';

export const DISABILITY = { none: '該当しない', general: '一般障害者', special: '特別障害者' };
export const WIDOW_SINGLE = { none: '該当しない', widow: '寡婦', singleParent: 'ひとり親' };
export const FILING_TYPE = { white: '白色申告', blue: '青色申告' };
export const BLUE_DEDUCTIONS = [10, 55, 65];
export const INSURANCE_TYPE = {
  employee: '会社員（健康保険・厚生年金）',
  voluntary: '会社の健康保険の任意継続（退職後）',
  national: '個人事業主など（国民健康保険・国民年金）',
  dependent: '家族の健康保険の被扶養者',
  none: 'その他・未加入',
};
export const WORK_STYLES = {
  employee: '会社員・パート',
  selfEmployed: '個人事業主',
  sideJob: '副業',
  investment: '投資（FXなど）',
  realEstate: '不動産',
};
export const RELATIONSHIPS = { child: '子', parent: '親', grandparent: '祖父母', sibling: '兄弟姉妹', other: 'その他親族' };
export const BUSINESS_TYPES = {
  unknown: '不明・対象外（個人事業税0円として扱う）',
  type1: '第1種事業（物品販売業・飲食店業・請負業・製造業など）',
  type2: '第2種事業（畜産業・水産業・薪炭製造業）',
  type3: '第3種事業（医業・弁護士業・税理士業・デザイン業・理容業など）',
  type3b: '第3種事業のうち、あん摩・マッサージ・柔道整復など／装蹄師業',
};

export { newId };

export function newIncome(category = 'salary') {
  const cat = getIncomeCategory(category);
  return {
    id: newId(),
    category,
    name: '',
    amount: 0, // 収入（FXは年間損益）。inputKind が directIncome の場合は所得金額
    expenses: 0, // 経費合計（hasExpenses の区分のみ使用）
    taxMethod: cat && cat.taxMethod ? cat.taxMethod : 'comprehensive', // 「その他」ではユーザーが選ぶ
    businessType: 'unknown', // 事業収入のみ。個人事業税の判定用（フェーズ2）
  };
}

export function newDependent() {
  return {
    id: newId(),
    name: '',
    relationship: 'child',
    age: 0,
    cohabiting: true,
    income: 0, // 合計所得金額の見込み
    disability: 'none',
  };
}

export function defaultState() {
  const deductions = {};
  for (const d of MANUAL_DEDUCTIONS) {
    deductions[d.id] = d.fields ? Object.fromEntries(d.fields.map((f) => [f.key, 0])) : { amount: 0 };
  }
  const credits = {};
  for (const c of MANUAL_TAX_CREDITS) credits[c.id] = { amount: 0 };
  return {
    taxYear: DEFAULT_YEAR,
    residence: { prefecture: AREAS[DEFAULT_AREA].prefecture, city: '', area: DEFAULT_AREA }, // area: 住民税・国保・事業税の基準地域。prefecture: 協会けんぽの支部
    workStyles: [],
    self: { age: 30, disability: 'none', widowSingleParent: 'none', workingStudent: false },
    spouse: { exists: false, age: 30, income: 0, disability: 'none', cohabiting: true },
    dependents: [],
    insurance: { type: 'employee', actualAnnual: null, monthlyPremium: null, nationalPension: false }, // actualAnnual: 実額（円）。null=概算を使う／monthlyPremium: 任意継続の毎月の保険料／nationalPension: 国民年金を別に払っているか（任意継続のとき）
    filing: { type: 'white', blueDeduction: 65 },
    incomes: [newIncome('salary')],
    listedCarryLosses: [], // 上場株式等の繰越損失（fxCarryLosses と同じ形式）
    fxCarryLosses: [], // FX・先物の繰越損失 [{ year: 損失が生じた年, amount: 円(正の値) }]。損失の年の翌年以後3年間繰越控除できる（No.1523）
    deductions,
    taxCredits: credits,
    household: defaultHousehold(), // かんたん入力（世帯）。enabled のとき self/spouse/dependents はここから導かれる
  };
}

// ---- 検証 ----
// 戻り値: { ok, errors, state }。ok の場合 state は欠損を既定値で補った正規化済みデータ。
export function validateState(input) {
  const errors = [];
  const err = (path, msg) => errors.push(`${path}: ${msg}`);
  const base = defaultState();
  if (!isObj(input)) return { ok: false, errors: ['データがオブジェクトではありません'], state: null };

  const yen = (v, path, { min = 0, max = MAX_YEN, nullable = false } = {}) => {
    if (v == null && nullable) return null;
    if (!Number.isSafeInteger(v)) { err(path, '整数の金額ではありません'); return 0; }
    if (v < min || v > max) { err(path, `範囲外です (${min}〜${max})`); return 0; }
    return v;
  };
  const oneOf = (v, allowed, path, fallback) => {
    if (allowed.includes(v)) return v;
    err(path, `不正な値です: ${String(v)}`);
    return fallback;
  };
  const bool = (v, path, fb) => (typeof v === 'boolean' ? v : (err(path, '真偽値ではありません'), fb));
  const str = (v, path, fb = '', max = 100) => (typeof v === 'string' && v.length <= max ? v : (err(path, '文字列ではありません/長すぎます'), fb));

  const s = { ...base };
  s.taxYear = oneOf(input.taxYear, SUPPORTED_YEARS, 'taxYear', base.taxYear);

  const r = isObj(input.residence) ? input.residence : (err('residence', '不正です'), {});
  // area が無い旧データは、当時の計算（福山市の値）のまま読み込む。新規の既定は東京23区。
  s.residence = { prefecture: str(r.prefecture ?? '', 'residence.prefecture'), city: str(r.city ?? '', 'residence.city'), area: oneOf(r.area ?? 'fukuyama', Object.keys(AREAS), 'residence.area', 'fukuyama') };

  if (Array.isArray(input.workStyles)) {
    s.workStyles = input.workStyles.filter((w) => {
      const ok = w in WORK_STYLES;
      if (!ok) err('workStyles', `不正な値: ${String(w)}`);
      return ok;
    });
  } else err('workStyles', '配列ではありません');

  const me = isObj(input.self) ? input.self : (err('self', '不正です'), {});
  s.self = {
    age: yen(me.age, 'self.age', { max: 120 }),
    disability: oneOf(me.disability, Object.keys(DISABILITY), 'self.disability', 'none'),
    widowSingleParent: oneOf(me.widowSingleParent, Object.keys(WIDOW_SINGLE), 'self.widowSingleParent', 'none'),
    workingStudent: bool(me.workingStudent, 'self.workingStudent', false),
  };

  const sp = isObj(input.spouse) ? input.spouse : (err('spouse', '不正です'), {});
  s.spouse = {
    exists: bool(sp.exists, 'spouse.exists', false),
    age: yen(sp.age ?? 30, 'spouse.age', { max: 120 }),
    income: yen(sp.income, 'spouse.income'),
    disability: oneOf(sp.disability, Object.keys(DISABILITY), 'spouse.disability', 'none'),
    cohabiting: bool(sp.cohabiting, 'spouse.cohabiting', true),
  };

  if (Array.isArray(input.dependents)) {
    if (input.dependents.length > 50) err('dependents', '人数が多すぎます');
    s.dependents = input.dependents.slice(0, 50).map((d, i) => {
      const p = `dependents[${i}]`;
      if (!isObj(d)) { err(p, '不正です'); return newDependent(); }
      return {
        id: typeof d.id === 'string' && d.id && d.id.length <= 80 ? d.id : newId(),
        name: str(d.name ?? '', `${p}.name`),
        relationship: oneOf(d.relationship, Object.keys(RELATIONSHIPS), `${p}.relationship`, 'other'),
        age: yen(d.age, `${p}.age`, { max: 120 }),
        cohabiting: bool(d.cohabiting, `${p}.cohabiting`, true),
        income: yen(d.income, `${p}.income`),
        disability: oneOf(d.disability, Object.keys(DISABILITY), `${p}.disability`, 'none'),
      };
    });
  } else err('dependents', '配列ではありません');

  const ins = isObj(input.insurance) ? input.insurance : (err('insurance', '不正です'), {});
  s.insurance = {
    type: oneOf(ins.type, Object.keys(INSURANCE_TYPE), 'insurance.type', 'employee'),
    actualAnnual: yen(ins.actualAnnual ?? null, 'insurance.actualAnnual', { nullable: true }),
    monthlyPremium: yen(ins.monthlyPremium ?? null, 'insurance.monthlyPremium', { nullable: true }),
    nationalPension: bool(ins.nationalPension ?? false, 'insurance.nationalPension', false),
  };

  const f = isObj(input.filing) ? input.filing : (err('filing', '不正です'), {});
  s.filing = {
    type: oneOf(f.type, Object.keys(FILING_TYPE), 'filing.type', 'white'),
    blueDeduction: oneOf(f.blueDeduction, BLUE_DEDUCTIONS, 'filing.blueDeduction', 65),
  };

  if (Array.isArray(input.incomes)) {
    if (input.incomes.length > 100) err('incomes', '件数が多すぎます');
    s.incomes = input.incomes.slice(0, 100).map((x, i) => {
      const p = `incomes[${i}]`;
      if (!isObj(x)) { err(p, '不正です'); return newIncome(); }
      const category = oneOf(x.category, INCOME_CATEGORIES.map((c) => c.id), `${p}.category`, 'other');
      const cat = getIncomeCategory(category);
      const allowNeg = cat.inputKind === 'profit' || cat.inputKind === 'directIncome';
      const amount = yen(x.amount, `${p}.amount`, { min: allowNeg ? -MAX_YEN : 0 });
      return {
        id: typeof x.id === 'string' && x.id && x.id.length <= 80 ? x.id : newId(),
        category,
        name: str(x.name ?? '', `${p}.name`),
        amount,
        expenses: yen(x.expenses ?? 0, `${p}.expenses`),
        taxMethod: oneOf(x.taxMethod ?? cat.taxMethod ?? 'comprehensive', ['comprehensive', 'separate', 'withholding'], `${p}.taxMethod`, 'comprehensive'),
        businessType: oneOf(x.businessType ?? 'unknown', Object.keys(BUSINESS_TYPES), `${p}.businessType`, 'unknown'),
      };
    });
  } else err('incomes', '配列ではありません');

  // 繰越損失（年ごと）。旧形式の fxCarryForward（単一の金額）は「前年に生じた損失」として読み替える。
  const lossList = (raw, name) => {
    if (!Array.isArray(raw)) { err(name, '配列ではありません'); return []; }
    if (raw.length > 20) err(name, '件数が多すぎます');
    return raw.slice(0, 20).map((l, i) => {
      const p = `${name}[${i}]`;
      if (!isObj(l)) { err(p, '不正です'); return { year: s.taxYear - 1, amount: 0 }; }
      return { year: yen(l.year, `${p}.year`, { min: 1990, max: 2100 }) || s.taxYear - 1, amount: yen(l.amount, `${p}.amount`) };
    });
  };
  const rawLosses = input.fxCarryLosses ?? (Number.isSafeInteger(input.fxCarryForward) && input.fxCarryForward > 0 ? [{ year: s.taxYear - 1, amount: input.fxCarryForward }] : []);
  s.fxCarryLosses = lossList(rawLosses, 'fxCarryLosses');
  s.listedCarryLosses = lossList(input.listedCarryLosses ?? [], 'listedCarryLosses');

  const ded = isObj(input.deductions) ? input.deductions : (err('deductions', '不正です'), {});
  for (const d of MANUAL_DEDUCTIONS) {
    const keys = d.fields ? d.fields.map((x) => x.key) : ['amount'];
    const src = isObj(ded[d.id]) ? ded[d.id] : {};
    s.deductions[d.id] = Object.fromEntries(keys.map((k) => [k, yen(src[k] ?? 0, `deductions.${d.id}.${k}`)]));
  }
  const cr = isObj(input.taxCredits) ? input.taxCredits : (err('taxCredits', '不正です'), {});
  for (const c of MANUAL_TAX_CREDITS) {
    const src = isObj(cr[c.id]) ? cr[c.id] : {};
    s.taxCredits[c.id] = { amount: yen(src.amount ?? 0, `taxCredits.${c.id}.amount`) };
  }

  s.household = validateHousehold(input.household, { err, yen, oneOf, bool, str });

  return { ok: errors.length === 0, errors, state: s };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---- バージョン移行 ----
// 旧バージョンのデータを現行形式に変換する。MIGRATIONS[n] は n → n+1 の変換。
export const MIGRATIONS = {
  // 例: 1: (data) => ({ ...data, newField: 0 }),
};

export function migrate(data, fromVersion) {
  let v = fromVersion;
  let cur = data;
  while (v < DATA_VERSION) {
    const fn = MIGRATIONS[v];
    if (!fn) throw new Error(`バージョン ${v} からの移行手順がありません`);
    cur = fn(cur);
    v += 1;
  }
  return cur;
}
