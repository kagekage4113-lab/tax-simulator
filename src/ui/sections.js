import { h, field, select, checkbox, badge } from './dom.js';
import { gaugeField } from './gaugeField.js';
import {
  BLUE_DEDUCTIONS, BUSINESS_TYPES, DISABILITY, FILING_TYPE, INSURANCE_TYPE, RELATIONSHIPS, WIDOW_SINGLE, WORK_STYLES,
  newDependent, newIncome,
} from '../core/schema.js';
import { INCOME_CATEGORIES, TAX_METHOD_LABEL, getIncomeCategory } from '../data/incomeCategories.js';
import { INCOME_DEDUCTIONS, MANUAL_DEDUCTIONS, MANUAL_TAX_CREDITS, TAX_CREDITS } from '../data/deductions.js';
import { SUPPORTED_YEARS, getTaxYear, yearLabel } from '../data/taxYears/index.js';
import { formatYen } from '../core/money.js';
import { calculate } from '../calc/engine.js';

const PREFECTURES = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

const section = (title, id, children, { open = true, note } = {}) =>
  h('details', { class: 'card', id, open }, h('summary', {}, title), note ? h('p', { class: 'note' }, note) : null, h('div', { class: 'body' }, children));

const num = (v, fb = 0) => (Number.isFinite(v) ? v : fb);

// ---- 1. 年度・申告条件 ----
export function settingsSection(store) {
  const s = store.get();
  const set = (fn, structural = false) => store.update(fn, { structural });
  const yearOptions = Object.fromEntries(SUPPORTED_YEARS.map((y) => [y, yearLabel(y)]));
  const ty = getTaxYear(s.taxYear);

  const prefOptions = { '': '選択してください', ...Object.fromEntries(PREFECTURES.map((p) => [p, p])) };
  const personal = [
    h('h3', {}, '本人'),
    gaugeField({ label: '年齢（12月31日時点）', value: s.self.age, max: 100, step: 1, unit: '歳', onChange: (v) => set((x) => { x.self.age = Math.min(v, 120); }) }),
    field('障害の区分', select(DISABILITY, s.self.disability, (v) => set((x) => { x.self.disability = v; }))),
    field('寡婦・ひとり親', select(WIDOW_SINGLE, s.self.widowSingleParent, (v) => set((x) => { x.self.widowSingleParent = v; }))),
    checkbox('勤労学生に該当する', s.self.workingStudent, (v) => set((x) => { x.self.workingStudent = v; })),
    h('h3', {}, '配偶者'),
    checkbox('配偶者がいる', s.spouse.exists, (v) => set((x) => { x.spouse.exists = v; }, true)),
    ...(s.spouse.exists ? [
      gaugeField({ label: '配偶者の年齢（12月31日時点）', value: s.spouse.age, max: 100, step: 1, unit: '歳', onChange: (v) => set((x) => { x.spouse.age = Math.min(v, 120); }) }),
      gaugeField({ label: '配偶者の合計所得金額（見込み）', value: s.spouse.income, max: 2_000_000, onChange: (v) => set((x) => { x.spouse.income = v; }) }),
      field('配偶者の障害の区分', select(DISABILITY, s.spouse.disability, (v) => set((x) => { x.spouse.disability = v; }))),
      checkbox('同居している', s.spouse.cohabiting, (v) => set((x) => { x.spouse.cohabiting = v; })),
    ] : []),
    h('h3', {}, '扶養親族'),
    ...s.dependents.map((d, i) => dependentCard(store, d, i)),
    h('button', { type: 'button', class: 'btn', onClick: () => set((x) => { x.dependents.push(newDependent()); }, true) }, '＋ 扶養親族を追加'),
    h('p', { class: 'note' }, '障害者・扶養・寡婦などの適用はユーザーの申告に基づきます。適用には証明書類が必要な場合があります。税法上の扶養と、健康保険・社会保険上の扶養は別の制度です。'),
  ];

  return section('年度・申告条件', 'sec-settings', [
    field('計算対象年', select(yearOptions, s.taxYear, (v) => set((x) => { x.taxYear = Number(v); }, true))),
    ty && ty.status === 'skeleton'
      ? h('p', { class: 'warn' }, `${ty.label}の税率・控除額は未登録です（フェーズ2で公的資料を確認して登録します）。`) : null,
    field('お住まいの都道府県', select(prefOptions, s.residence.prefecture, (v) => set((x) => { x.residence.prefecture = v; })),
      { hint: '会社員の社会保険料（協会けんぽ）の料率に使います。広島・福岡・大阪以外は3府県の平均で概算します。住民税の税率・控除は現在、福山市の値です。' }),
    field('市区町村', h('input', { type: 'text', value: s.residence.city, maxlength: 100, placeholder: '例：渋谷区', onInput: (e) => set((x) => { x.residence.city = e.target.value; }) }),
      { hint: '自治体別の計算はフェーズ4以降。現在は全国共通の概算を使う予定です。' }),
    h('fieldset', { class: 'chips' }, h('legend', {}, '収入の種類（複数選択可）'),
      Object.entries(WORK_STYLES).map(([k, label]) => checkbox(label, s.workStyles.includes(k), (on) => set((x) => {
        x.workStyles = on ? [...new Set([...x.workStyles, k])] : x.workStyles.filter((w) => w !== k);
      })))),
    field('申告方式', select(FILING_TYPE, s.filing.type, (v) => set((x) => { x.filing.type = v; }, true))),
    ...(s.filing.type === 'blue' ? [
      field('青色申告特別控除', select(Object.fromEntries(BLUE_DEDUCTIONS.map((n) => [n, `${n}万円`])), s.filing.blueDeduction, (v) => set((x) => { x.filing.blueDeduction = Number(v); })),
        { hint: '55万円・65万円は複式簿記での記帳が必要で、65万円はe-Tax提出または電子帳簿保存も必要です。条件を満たすかはご自身の申告として扱います。' }),
    ] : []),
    field('社会保険の加入状況', select(INSURANCE_TYPE, s.insurance.type, (v) => set((x) => { x.insurance.type = v; }))),
    checkbox('年間の社会保険料の実額を入力する（未入力時は概算）', s.insurance.actualAnnual != null, (on) => set((x) => { x.insurance.actualAnnual = on ? 0 : null; }, true)),
    ...(s.insurance.actualAnnual != null ? [
      gaugeField({ label: '年間の社会保険料（実額）', value: s.insurance.actualAnnual, max: 3_000_000, onChange: (v) => set((x) => { x.insurance.actualAnnual = v; }) }),
    ] : []),
    h('details', { class: 'sub' }, h('summary', {}, '本人・配偶者・扶養親族'), ...personal),
  ]);
}

function dependentCard(store, d, i) {
  const set = (fn, structural = false) => store.update(fn, { structural });
  const upd = (key, val, structural) => set((x) => { x.dependents[i][key] = val; }, structural);
  return h('div', { class: 'item' },
    h('div', { class: 'item-head' }, h('strong', {}, `扶養親族 ${i + 1}`),
      h('button', { type: 'button', class: 'btn danger', onClick: () => set((x) => { x.dependents.splice(i, 1); }, true) }, '削除')),
    field('名前（メモ）', h('input', { type: 'text', value: d.name, maxlength: 100, onInput: (e) => upd('name', e.target.value) })),
    field('続柄', select(RELATIONSHIPS, d.relationship, (v) => upd('relationship', v))),
    gaugeField({ label: '年齢（12月31日時点）', value: d.age, max: 100, step: 1, unit: '歳', onChange: (v) => upd('age', Math.min(v, 120)) }),
    gaugeField({ label: '合計所得金額（見込み）', value: d.income, max: 2_000_000, onChange: (v) => upd('income', v) }),
    field('障害の区分', select(DISABILITY, d.disability, (v) => upd('disability', v))),
    checkbox('同居している', d.cohabiting, (v) => upd('cohabiting', v)),
  );
}

// ---- 2. 収入と経費 ----
export function incomesSection(store) {
  const s = store.get();
  const set = (fn, structural = false) => store.update(fn, { structural });
  const catOptions = Object.fromEntries(INCOME_CATEGORIES.map((c) => [c.id, c.label + (c.supported ? '' : '（未対応）')]));

  const cards = s.incomes.map((inc, i) => {
    const cat = getIncomeCategory(inc.category);
    const upd = (key, val, structural) => set((x) => { x.incomes[i][key] = val; }, structural);
    const tm = cat.taxMethod || inc.taxMethod;
    const label = cat.inputKind === 'profit' ? '年間の損益（経費控除後・損失はマイナス）'
      : cat.inputKind === 'directIncome' ? '所得金額（直接入力）'
      : inc.category === 'salary' ? '年間の給与収入（額面）' : '年間の収入（売上）';
    return h('div', { class: 'item' },
      h('div', { class: 'item-head' },
        h('strong', {}, inc.name || cat.label),
        h('span', {}, badge(TAX_METHOD_LABEL[tm] || '課税方式未選択'), ' ', cat.supported ? null : badge('簡易扱い', 'warn')),
        h('button', { type: 'button', class: 'btn danger', onClick: () => set((x) => { x.incomes.splice(i, 1); }, true) }, '削除')),
      field('収入区分', select(catOptions, inc.category, (v) => set((x) => {
        const it = x.incomes[i]; it.category = v;
        const c = getIncomeCategory(v);
        if (c.taxMethod) it.taxMethod = c.taxMethod;
        if (!c.hasExpenses) it.expenses = 0;
        if (c.inputKind !== 'profit' && c.inputKind !== 'directIncome' && it.amount < 0) it.amount = 0;
      }, true))),
      field('名称（メモ）', h('input', { type: 'text', value: inc.name, maxlength: 100, placeholder: '例：本業の給与、ブログ収入', onInput: (e) => set((x) => { x.incomes[i].name = e.target.value; }) })),
      ...(!cat.supported ? [
        h('p', { class: 'warn' }, `「${cat.label}」の自動計算は未対応です。所得金額を直接入力してください。特例や通算ルールは自動適用しません（簡易扱い）。`),
        ...(cat.taxMethod === null ? [field('課税方式', select({ comprehensive: '総合課税', separate: '申告分離課税' }, inc.taxMethod, (v) => upd('taxMethod', v)))] : []),
      ] : []),
      gaugeField({ label, value: inc.amount, max: cat.inputKind === 'profit' ? 5_000_000 : 20_000_000, allowNegative: cat.inputKind === 'profit' || cat.inputKind === 'directIncome', onChange: (v) => upd('amount', v) }),
      ...(cat.hasExpenses ? [gaugeField({ label: '必要経費の合計', value: inc.expenses, max: 10_000_000, onChange: (v) => upd('expenses', v), hint: '内訳は入力しません（合計のみ）。' })] : []),
      ...(inc.category === 'business' ? [
        field('事業の業種区分（個人事業税の判定用）', select(BUSINESS_TYPES, inc.businessType, (v) => upd('businessType', v)), { hint: '不明・対象外の場合、個人事業税は0円として扱います。' }),
      ] : []),
      inc.category === 'fx' ? h('p', { class: 'note' }, '国内の業者を利用したFX（先物取引に係る雑所得等）が対象で、所得税15%・住民税5%の申告分離課税です。海外業者は総合課税の雑所得になるため対象外です（「雑所得」に入力してください）。年間損益は業者の年間取引報告書の実額を入力してください。') : null,
      inc.category === 'crypto' ? h('p', { class: 'note' }, '暗号資産は雑所得（総合課税）として扱い、赤字は他の所得と通算しません。') : null,
      inc.category === 'salary' ? h('p', { class: 'note' }, '給与所得控除を使うため経費は入力しません（特定支出控除は未対応）。') : null,
    );
  });

  return section('現在の収入と経費', 'sec-incomes', [
    s.incomes.length === 0 ? h('p', { class: 'note' }, '収入がまだ登録されていません。') : null,
    ...cards,
    s.incomes.some((x) => x.category === 'fx') ? gaugeField({ label: 'FX・先物の繰越損失（前年までの繰越額）', value: s.fxCarryForward, max: 5_000_000, onChange: (v) => set((x) => { x.fxCarryForward = v; }), hint: '最長3年繰り越せます。繰越の年数チェックは未対応のため、残っている額だけを入力してください。' }) : null,
    h('button', { type: 'button', class: 'btn primary', onClick: () => set((x) => { x.incomes.push(newIncome('business')); }, true) }, '＋ 収入を追加'),
  ]);
}

// ---- 3. 所得控除・税額控除 ----
export function deductionsSection(store) {
  const s = store.get();
  const set = (fn) => store.update(fn);

  const manual = (def, group) => {
    const box = group === 'deductions' ? s.deductions[def.id] : s.taxCredits[def.id];
    const fields = def.fields || [{ key: 'amount', label: '金額' }];
    return h('div', { class: 'item' },
      h('strong', {}, def.label),
      h('p', { class: 'hint' }, def.condition),
      ...fields.map((f) => gaugeField({
        label: def.fields ? f.label : '控除額（年間）',
        value: box[f.key], max: 1_000_000,
        onChange: (v) => set((x) => { x[group][def.id][f.key] = v; }),
      })),
      h('span', {}, badge('手入力値')));
  };

  const statusRow = (d) => h('li', {},
    h('span', {}, d.label), ' ',
    d.supported ? badge(d.inputMode === 'auto' ? '自動計算（フェーズ2）' : '手入力', '') : badge('未対応', 'warn'));

  return section('所得控除・税額控除', 'sec-deductions', [
    h('p', { class: 'note' }, '控除額の自動計算はフェーズ2で対応します。ここでは手入力が必要な控除の入力欄を用意しています。適用条件を満たすかはご自身の申告に基づきます。'),
    h('h3', {}, '手入力する所得控除'),
    ...MANUAL_DEDUCTIONS.filter((d) => d.supported).map((d) => manual(d, 'deductions')),
    h('h3', {}, '手入力する税額控除'),
    ...MANUAL_TAX_CREDITS.map((d) => manual(d, 'taxCredits')),
    h('details', { class: 'sub' }, h('summary', {}, '控除の対応状況'),
      h('ul', { class: 'status-list' }, [...INCOME_DEDUCTIONS, ...TAX_CREDITS].map(statusRow))),
  ], { open: false });
}

// ---- 4. 結果 ----
const MISSING_LABEL = {
  'incomeTax.brackets': '所得税の税率表（速算表）',
  'incomeTax.reconstructionRate': '復興特別所得税の率',
  'residentTax.incomeRate': '住民税の所得割率',
  'residentTax.perCapita': '住民税の均等割',
  'basicDeduction.incomeTax': '基礎控除（所得税）',
  'basicDeduction.residentTax': '基礎控除（住民税）',
  'salaryDeduction.brackets': '給与所得控除',
  'fx.incomeTaxRate': 'FXの所得税率',
  'fx.residentTaxRate': 'FXの住民税率',
  'businessTax.rate': '個人事業税の税率',
  'businessTax.mainDeduction': '個人事業税の事業主控除',
  'businessTax.rates': '個人事業税の税率',
  'deductions.residentTax': '住民税の所得控除額（配偶者・扶養・障害者など）',
  'deductions.incomeTax': '所得税の人的控除の金額',
  'deductions.incomeTax.specificRelative.ageMin': '特定親族の年齢要件',
  medical: '医療費控除の足切り・上限',
};
const missingLabel = (key) => {
  const [k, over] = key.split('@');
  const base = missingLabelBase(k);
  return over ? `${base}（${formatYen(Number(over.slice(1)))}円超の区分）` : base;
};
const missingLabelBase = (k) => MISSING_LABEL[k] || (k.startsWith('rounding.') ? `端数処理（${k.slice(9)}）` : k.startsWith('socialInsurance.estimate') ? '社会保険料の概算率' : k);
const MODE_LABEL = { auto: '自動', manual: '手入力値', actual: '実額', estimate: '概算', pending: '未対応（0円）' };

export function resultSection(rulesFor = getTaxYear) {
  const body = h('div', {});
  const el = section('税金と手取りの結果', 'sec-result', [body]);
  const yen = (v) => (v == null ? '—' : `${formatYen(v)}円`);
  const row = (label, value, opts = {}) => h('tr', { class: opts.strong ? 'strong' : '' }, h('th', {}, label, opts.tag ? [' ', badge(opts.tag)] : null), h('td', { class: 'r' }, value));

  el.update = (s) => {
    const r = calculate(s, rulesFor(s.taxYear));
    const i = r.income;
    const hasBusinessTax = s.incomes.some((x) => x.category === 'business' && x.businessType !== 'unknown');
    const kids = [];

    if (r.missing.length) {
      kids.push(h('p', { class: 'warn' },
        `${yearLabel(s.taxYear)}の次の税制データが未登録のため、確定できない金額があります（—と表示）：`,
        h('br'), [...new Set(r.missing.map(missingLabel))].join('、')));
    }
    kids.push(h('table', { class: 'tbl summary' }, h('tbody', {},
      row('年間収入', yen(i.revenueTotal + i.fx.profit)),
      row('所得（合計）', yen(i.total), { tag: i.total == null ? null : '概算' }),
      row('所得税（復興税含む）', yen(r.incomeTax?.total)),
      row('住民税（翌年度分）', yen(r.residentTax?.total), { tag: '概算' }),
      hasBusinessTax ? row('個人事業税（翌年納付）', yen(r.businessTax.total)) : null,
      row('社会保険料', yen(r.socialInsurance.total), { tag: MODE_LABEL[r.socialInsurance.mode] }),
      row('年間負担合計', yen(r.burden), { strong: true }),
      row('年間手取り', yen(r.takeHome), { strong: true }))));
    kids.push(h('p', { class: 'hint' }, '住民税・個人事業税は翌年支払いですが、当年所得に対する負担として計上しています。金額はあくまで目安です。'));

    // 詳細（計算根拠）
    const det = [];
    det.push(h('h3', {}, '所得の計算'));
    det.push(h('table', { class: 'tbl' }, h('tbody', {},
      s.incomes.some((x) => x.category === 'salary') ? row(`給与所得（収入${formatYen(i.salaryRevenue)} − 給与所得控除${formatYen(i.salaryDeduction)}）`, yen(i.salaryIncome)) : null,
      s.incomes.some((x) => x.category === 'business') ? row(`事業所得（青色特別控除 ${formatYen(i.blueDeductionApplied)}円を適用）`, yen(i.businessIncome)) : null,
      s.incomes.some((x) => x.category === 'realEstate') ? row('不動産所得', yen(i.realEstateNet)) : null,
      s.incomes.some((x) => x.category === 'misc') ? row('雑所得（赤字は通算しない）', yen(i.miscIncome)) : null,
      i.simpleComp ? row('その他（直接入力・簡易扱い）', yen(i.simpleComp), { tag: '簡易' }) : null,
      row('総合課税の所得（損益通算後）', yen(i.comprehensive), { strong: true }),
      i.lossOffset ? row('通算しきれない赤字', yen(i.lossOffset)) : null,
      s.incomes.some((x) => x.category === 'fx') ? row(`FX所得（損益${formatYen(i.fx.profit)} − 繰越控除${formatYen(i.fx.carryUsed)}）`, yen(i.fx.income), { tag: '分離課税' }) : null,
      s.incomes.some((x) => x.category === 'fx') ? row('翌年への繰越損失', yen(i.fx.carryRemaining)) : null)));

    det.push(h('h3', {}, '所得控除'));
    for (const [kind, title] of [['incomeTax', '所得税'], ['residentTax', '住民税']]) {
      const d = r.deductions[kind];
      det.push(h('details', { class: 'sub' }, h('summary', {}, `${title}の所得控除 計 ${yen(d.total)}`),
        h('table', { class: 'tbl' }, h('tbody', {}, d.items.map((x) => row(x.label, yen(x.amount), { tag: MODE_LABEL[x.mode] }))))));
    }
    const t = r.taxable.incomeTax;
    if (t) det.push(h('p', { class: 'hint' }, `所得税の課税所得：総合 ${formatYen(t.comprehensive)}円${i.fx.income ? ` ／ FX ${formatYen(t.fx)}円（総合で引ききれない控除 ${formatYen(t.spillToFx)}円をFXから差引）` : ''}${t.unusedDeduction ? ` ／ 使い切れない控除 ${formatYen(t.unusedDeduction)}円` : ''}`));

    det.push(h('h3', {}, '税額の内訳'));
    det.push(h('table', { class: 'tbl' }, h('tbody', {},
      r.incomeTax ? [
        row('総合課税分の所得税', yen(r.incomeTax.comprehensiveTax)),
        i.fx.income ? row('FX分の所得税（分離課税）', yen(r.incomeTax.fxTax)) : null,
        r.incomeTax.credit ? row('税額控除（住宅ローン控除など）', `−${formatYen(r.incomeTax.credit)}円`, { tag: '手入力値' }) : null,
        row('基準所得税額（復興税を除く）', yen(r.incomeTax.base)),
        row('復興特別所得税', yen(r.incomeTax.reconstruction)),
      ] : null,
      r.residentTax ? [
        row('住民税 所得割', yen(r.residentTax.incomeLevy)),
        r.residentTax.credit ? row('寄附金税額控除など', `−${formatYen(r.residentTax.credit)}円`, { tag: '手入力値' }) : null,
        i.fx.income ? row('FX分の住民税（分離課税）', yen(r.residentTax.fxTax)) : null,
        row('住民税 均等割', yen(r.residentTax.perCapita)),
      ] : null)));
    if (r.businessTax.note) det.push(h('p', { class: 'hint' }, `個人事業税：${r.businessTax.note}`));
    if (r.notes.length) det.push(h('ul', { class: 'status-list' }, r.notes.map((n) => h('li', {}, n))));
    kids.push(h('details', { class: 'sub' }, h('summary', {}, '計算の詳細・前提'), ...det));
    body.replaceChildren(...kids.filter(Boolean));
  };
  return el;
}

// ---- 5. シミュレーション（フェーズ3） ----
export function simulationSection() {
  return section('収入・経費の変動シミュレーション', 'sec-sim', [
    h('p', { class: 'note' }, 'フェーズ3で実装予定：「あと50万円稼いだら？」の比較、限界負担率、壁の表示、FXの利確タイミング比較。'),
  ], { open: false });
}
