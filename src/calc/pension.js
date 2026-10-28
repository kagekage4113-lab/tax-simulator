// 公的年金等に係る雑所得の金額（国税庁 No.1600 の速算表）。年金収入から所得を求める。
// 表が未登録（table が無い）、または年金以外の所得の区分に合う行が無いときは null（推測しない）。
import { mulFloor } from '../core/money.js';

// otherIncome: 公的年金等に係る雑所得以外の合計所得金額（既定0）。age: 12月31日時点の年齢。
export function publicPensionIncome(revenue, age, table, otherIncome = 0) {
  if (!table) return null;
  const tier = table.tiers.find((t) => t.otherIncomeMax === null || otherIncome <= t.otherIncomeMax);
  if (!tier) return null;
  const t = age >= 65 ? tier.over65 : tier.under65;
  if (revenue <= t.zeroMax) return 0;
  const row = t.rows.find((r) => r.lt === null || revenue < r.lt);
  return mulFloor(revenue, row.rate) - row.sub;
}
