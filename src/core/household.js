// 世帯（かんたん入力）の入力データ。税法の用語ではなく、生活の事実（同居・生活費・収入・手帳）を持つ。
// 税法上の扱い（扶養・障害者区分など）は interview/assess.js が年度別データを使って導く。
// 三値の事実（true / false / null）は null = 未回答。未回答は「確定」にせず、要確認として扱う。
import { newId } from '../core/ids.js';

export const PERSON_KINDS = { spouse: '配偶者', child: '子', parent: '親・祖父母', other: 'その他の親族' };
export const INCOME_KINDS = {
  none: '収入はない',
  salary: '給与（パート・アルバイトを含む）',
  pension: '年金',
  business: '自営業・事業',
  other: 'その他（所得の金額が分かる場合）',
  unknown: '分からない',
};
// 障害者控除の区分は国税庁 No.1160 に基づく（手帳の種類と等級 → 一般／特別）。
export const CERTIFICATES = {
  none: '手帳などはない',
  phys12: '身体障害者手帳（1級・2級）',
  phys3plus: '身体障害者手帳（3級以下）',
  mental1: '精神障害者保健福祉手帳（1級）',
  mentalOther: '精神障害者保健福祉手帳（2級・3級）',
  other: '療育手帳・要介護の認定など（要確認）',
  unknown: '分からない・未確認',
};

export const newPerson = (kind) => ({
  id: newId(),
  kind,
  name: '',
  age: kind === 'child' ? 10 : kind === 'parent' ? 70 : 40,
  livesTogether: kind === 'child' ? true : null, // 同居している
  supportedByMe: kind === 'child' ? true : null, // 生活費の大半をあなたが負担している（生計を一にする）
  incomeKind: 'none',
  revenue: 0, // 給与=年収、年金=年金の年額、事業=売上、その他=所得金額
  expenses: 0, // 事業の必要経費
  certificate: 'none',
  medical: false, // 通院・入院などの医療費を払っている
  sameHousehold: null, // 住民票の世帯があなたと同じか。null（未回答）のときは「同居しているか」で代用する
  partnerId: null, // この家族の中の配偶者（親どうしが夫婦、など）の id。住民税の非課税の判定で同一生計配偶者として数える
});

export const defaultHousehold = () => ({
  enabled: false,
  me: { certificate: 'none', partner: null, childClaimedElsewhere: null }, // partner: 事実上婚姻関係と同様の事情にある人がいるか／childClaimedElsewhere: 子が他の人（元の配偶者など）の扶養親族等になっているか
  people: [],
});

// helpers は schema.js の検証用ヘルパ（err/yen/oneOf/bool/str）。
export function validateHousehold(raw, { err, yen, oneOf, bool, str }) {
  const out = defaultHousehold();
  if (raw == null) return out;
  if (typeof raw !== 'object' || Array.isArray(raw)) { err('household', '不正です'); return out; }
  const tri = (v, path) => (v === null || v === undefined ? null : typeof v === 'boolean' ? v : (err(path, '真偽値でも未回答(null)でもありません'), null));
  out.enabled = raw.enabled === undefined ? false : bool(raw.enabled, 'household.enabled', false);
  const me = raw.me && typeof raw.me === 'object' ? raw.me : {};
  out.me = {
    certificate: oneOf(me.certificate ?? 'none', Object.keys(CERTIFICATES), 'household.me.certificate', 'none'),
    partner: tri(me.partner, 'household.me.partner'),
    childClaimedElsewhere: tri(me.childClaimedElsewhere, 'household.me.childClaimedElsewhere'),
  };
  if (raw.people !== undefined && !Array.isArray(raw.people)) { err('household.people', '配列ではありません'); return out; }
  const list = raw.people || [];
  if (list.length > 30) err('household.people', '人数が多すぎます');
  out.people = list.slice(0, 30).map((p, i) => {
    const path = `household.people[${i}]`;
    if (!p || typeof p !== 'object') { err(path, '不正です'); return newPerson('other'); }
    return {
      id: typeof p.id === 'string' && p.id && p.id.length <= 80 ? p.id : newId(),
      kind: oneOf(p.kind, Object.keys(PERSON_KINDS), `${path}.kind`, 'other'),
      name: str(p.name ?? '', `${path}.name`),
      age: yen(p.age, `${path}.age`, { max: 120 }),
      livesTogether: tri(p.livesTogether, `${path}.livesTogether`),
      supportedByMe: tri(p.supportedByMe, `${path}.supportedByMe`),
      incomeKind: oneOf(p.incomeKind ?? 'none', Object.keys(INCOME_KINDS), `${path}.incomeKind`, 'none'),
      revenue: yen(p.revenue ?? 0, `${path}.revenue`),
      expenses: yen(p.expenses ?? 0, `${path}.expenses`),
      certificate: oneOf(p.certificate ?? 'none', Object.keys(CERTIFICATES), `${path}.certificate`, 'none'),
      medical: bool(p.medical ?? false, `${path}.medical`, false),
      sameHousehold: tri(p.sameHousehold, `${path}.sameHousehold`),
      partnerId: typeof p.partnerId === 'string' && p.partnerId && p.partnerId.length <= 80 ? p.partnerId : null,
    };
  });
  return out;
}
