// 「いまの状況」: 税額0円の範囲（控除のクッション）と、非課税など「状態」が変わる境目を、平易な言葉で並べる。
import { h, field, select } from './dom.js';
import { formatYen } from '../core/money.js';
import { rulesOf } from '../data/taxYears/index.js';
import { SITUATION_TARGETS, situation } from '../calc/situation.js';
import { familyMargins, scenarioState, socialDependentMargins, man } from '../interview/assess.js';

const yen = (v) => (v == null ? '—' : `${formatYen(v)}円`);
const manR = (n) => (n >= 10_000 ? `${Math.round(n / 1000) / 10}万円` : `${formatYen(n)}円`);

const ROWS = {
  incomeTax: { title: '所得税がかかり始める', ok: (t, m) => `${t}があと${m}まで増えても、所得税は0円のまま` },
  residentLevy: { title: '住民税（所得割）がかかり始める', ok: (t, m) => `${t}があと${m}まで増えても、住民税の所得割は0円のまま`, note: '境目を少し超えた付近では、所得割が急には増えないよう減額される調整措置（逆転防止）があり、計算に入れています（東京都北区の公表式）。' },
  residentNonTaxable: { title: '住民税の「非課税」でなくなる（均等割が発生）', ok: (t, m) => `${t}があと${m}まで増えても、住民税は非課税のまま`, note: '合計所得金額が非課税の限度を超えると、所得割が0円でも、均等割（年額）がかかり始めます。' },
  residentLevyNonTaxable: { title: '住民税の所得割も「非課税」でなくなる', ok: (t, m) => `${t}があと${m}まで増えても、所得割は非課税のまま` },
  kokuhoReduction: { title: '国保料の軽減が下がる', ok: (t, m) => `${t}があと${m}まで増えても、国保料の軽減は今のまま` },
  filing: { title: '所得税の確定申告が必要になる可能性', ok: (t, m) => `${t}があと${m}まで増えても、確定申告は不要となる可能性（参考）` },
};

function markText(row, target, mark) {
  if (mark.already) return '今の時点で、すでにこの状態です';
  if (mark.never) return '5,000万円までは変わりません';
  return row.ok(target, manR(mark.margin));
}

export function situationSection(store, rulesFor = rulesOf) {
  const el = h('details', { class: 'card', id: 'sec-situation', open: true }, h('summary', {}, 'いまの状況（どこまで余裕があるか）'));
  const body = h('div', { class: 'body' });
  el.append(body);
  let targetId = 'fx';
  let timer = null;

  const render = () => {
    const state = store.get();
    const rules = rulesFor(state);
    const sel = field('もし増えるのが…', select(Object.fromEntries(Object.entries(SITUATION_TARGETS).map(([k, v]) => [k, v.label])), targetId, (v) => { targetId = v; render(); }));
    if (!rules) { body.replaceChildren(sel, h('p', { class: 'warn' }, 'この年度の税制データが未登録のため、計算できません。')); return; }
    const hh = state.household;
    const useBoth = hh.enabled;
    const now = situation(useBoth ? scenarioState(state, rules, 'confirmed') : state, rules, targetId);
    const max = useBoth ? situation(scenarioState(state, rules, 'optimistic'), rules, targetId) : null;
    const target = SITUATION_TARGETS[targetId].label.replace('の利益', '');
    const kids = [sel];

    if (!now.ok) {
      kids.push(h('p', { class: 'warn' }, '税制データまたは入力（任意継続の保険料など）が足りず、まだ確定できません。結果の欄の表示を確認してください。'));
      body.replaceChildren(...kids);
      return;
    }
    const b = now.base;
    kids.push(h('table', { class: 'tbl summary' }, h('tbody', {},
      h('tr', {}, h('th', {}, '合計所得金額（いま）'), h('td', { class: 'r' }, yen(b.totalIncome))),
      h('tr', {}, h('th', {}, '所得税 / 住民税（いま）'), h('td', { class: 'r' }, `${yen(b.incomeTax)} / ${yen(b.residentTax)}`)),
      h('tr', {}, h('th', {}, '住民税の非課税'), h('td', { class: 'r' }, b.exemption === 'all' ? '非課税' : b.exemption === 'levy' ? '所得割のみ非課税' : '課税')))));

    const levy = now.marks.find((x) => x.id === 'residentLevy');
    const rows = now.marks.filter((m) => {
      if (m.id === 'residentNonTaxable') return b.exemption === 'all';
      // 所得割の非課税の限度と「所得割がかかり始める」位置が同じなら、重複するので出さない
      if (m.id === 'residentLevyNonTaxable') return b.exemption !== null && !(levy && levy.margin === m.margin && !!levy.already === !!m.already);
      return true;
    });
    const list = h('div', { class: 'verdicts' });
    for (const m of rows) {
      const row = ROWS[m.id];
      const other = max ? max.marks.find((x) => x.id === m.id) : null;
      const diff = other && !other.never && !m.never && other.margin !== m.margin;
      list.append(h('div', { class: `verdict ${m.already ? 'v-no' : 'v-applies'}` },
        h('div', { class: 'v-head' }, h('strong', {}, row.title)),
        h('p', { class: 'v-amount' }, markText(row, target, m)),
        diff ? h('p', { class: 'hint' }, `要確認がすべて当てはまれば、あと${manR(other.margin)}まで`) : null,
        !m.already && !m.never && m.totalIncomeAtMargin != null ? h('p', { class: 'hint' }, `そのとき合計所得金額は ${yen(m.totalIncomeAtMargin)} です。`) : null,
        row.note ? h('p', { class: 'hint' }, row.note) : null));
    }
    kids.push(list);

    if (hh.enabled) {
      const fam = familyMargins(state, rules);
      if (fam.length) {
        kids.push(h('h3', {}, '家族側の余裕（扶養の所得基準まで）'));
        kids.push(h('ul', { class: 'status-list' }, fam.map((f) => h('li', {},
          `${f.name || (f.kind === 'spouse' ? '配偶者' : '家族')}：所得${f.income === 0 ? '0円' : man(f.income)}。`,
          f.margin >= 0 ? `基準（${man(f.limit)}）まであと${manR(f.margin)}。` : `基準（${man(f.limit)}）を${manR(-f.margin)}超えています。`))));
      }
    }

    const sd = hh.enabled ? socialDependentMargins(state, rules) : [];
    if (sd.length) {
      kids.push(h('h3', {}, '健康保険の扶養（いわゆる130万円の壁）'));
      kids.push(h('ul', { class: 'status-list' }, sd.map((f) => h('li', {},
        `${f.name || (f.kind === 'spouse' ? '配偶者' : '家族')}：年間収入${f.income === 0 ? '0円' : man(f.income)}。`,
        f.within ? `基準（${man(f.limit)}未満${f.elder ? '・60歳以上' : f.youth ? '・19〜22歳' : ''}）まであと${manR(f.margin)}。` : `基準（${man(f.limit)}未満）に達しています。`,
        f.note ? ` ${f.note}。` : ''))));
      kids.push(h('p', { class: 'hint' }, 'あなたの健康保険の被扶養者にできるかの目安です。収入は所得ではなく「年間の見込み収入」で、公的年金・失業給付なども含みます（日本年金機構）。同居なら、あなたの収入の半分未満、別居なら、あなたからの仕送り額未満であることも必要です。障害者の基準（180万円未満）は障害厚生年金の受給要件に当たる程度の障害が対象で、手帳の等級とは別に判定されるため、ここでは60歳以上のみ180万円としています。給与収入だけの人は、労働条件通知書などの賃金から見込む年収で判定できます（令和8年4月から。契約期間が1年未満・シフト制などは対象外）。なお、106万円の壁（勤務先の社会保険に自分で入る基準）の賃金要件は2026年10月に撤廃されました。'));
    }

    kids.push(h('details', { class: 'edit' }, h('summary', {}, '見方と前提（「税額0円」と「非課税」は別です）'),
      h('p', { class: 'hint' }, '「所得税や住民税の税額が0円」なのは、所得控除で所得を打ち消せている状態です。「住民税の非課税」は、合計所得金額が限度額以下かどうかで決まる別の判定で、税額が0円でも非課税とは限りません。非課税でなくなると、所得割が0円でも均等割がかかります。'),
      h('p', { class: 'hint' }, 'FX・先物の利益は他の所得と分けて計算します。給与などから引ききれなかった所得控除は、FXの利益から差し引ける扱いで計算しています。申告書第三表の様式（「所得から差し引かれる金額」を各分離課税の所得に振り分ける欄）で仕組みは確認できましたが、手引きの文章による裏づけは未確認です。また、FXの利益で合計所得金額が増えると基礎控除が段階的に小さくなるため、控除の余り（クッション）は一定ではなく、上の「あと○円」はその段差を含めて計算しています。'),
      h('p', { class: 'hint' }, '住民税の非課税の判定は、分離課税のFXの所得も含めた合計所得金額で行っています（国税庁の専門用語集で、合計所得金額・総所得金額等に申告分離課税の所得を含めること、東京23区の住民税パンフレットで、先物取引に係る雑所得等が所得割の対象になることを確認済み）。繰越損失を引く前が合計所得金額（均等割の非課税など）、引いた後が総所得金額等（所得割の非課税など）です。額は1,000円単位の目安です（令和8年分の住民税は令和8年度の値で代用しています）。')));
    body.replaceChildren(...kids);
  };

  el.refresh = () => { clearTimeout(timer); timer = setTimeout(render, 120); };
  render();
  return el;
}
