// 全国健康保険協会（協会けんぽ）令和8年3月分（4月納付分）からの健康保険・厚生年金保険の保険料額表。
// 等級表（標準報酬月額と報酬月額の範囲）は広島・福岡・大阪の3支部で同一であることを確認済み（全50等級）。
// 報酬月額が min 以上 max 未満のとき標準報酬月額は standard。min が null は下限なし、max が null は上限なし。
export const KYOKAI_KENPO_GRADES = [
  { grade: 1, standard: 58000, min: null, max: 63000 },
  { grade: 2, standard: 68000, min: 63000, max: 73000 },
  { grade: 3, standard: 78000, min: 73000, max: 83000 },
  { grade: 4, standard: 88000, min: 83000, max: 93000 },
  { grade: 5, standard: 98000, min: 93000, max: 101000 },
  { grade: 6, standard: 104000, min: 101000, max: 107000 },
  { grade: 7, standard: 110000, min: 107000, max: 114000 },
  { grade: 8, standard: 118000, min: 114000, max: 122000 },
  { grade: 9, standard: 126000, min: 122000, max: 130000 },
  { grade: 10, standard: 134000, min: 130000, max: 138000 },
  { grade: 11, standard: 142000, min: 138000, max: 146000 },
  { grade: 12, standard: 150000, min: 146000, max: 155000 },
  { grade: 13, standard: 160000, min: 155000, max: 165000 },
  { grade: 14, standard: 170000, min: 165000, max: 175000 },
  { grade: 15, standard: 180000, min: 175000, max: 185000 },
  { grade: 16, standard: 190000, min: 185000, max: 195000 },
  { grade: 17, standard: 200000, min: 195000, max: 210000 },
  { grade: 18, standard: 220000, min: 210000, max: 230000 },
  { grade: 19, standard: 240000, min: 230000, max: 250000 },
  { grade: 20, standard: 260000, min: 250000, max: 270000 },
  { grade: 21, standard: 280000, min: 270000, max: 290000 },
  { grade: 22, standard: 300000, min: 290000, max: 310000 },
  { grade: 23, standard: 320000, min: 310000, max: 330000 },
  { grade: 24, standard: 340000, min: 330000, max: 350000 },
  { grade: 25, standard: 360000, min: 350000, max: 370000 },
  { grade: 26, standard: 380000, min: 370000, max: 395000 },
  { grade: 27, standard: 410000, min: 395000, max: 425000 },
  { grade: 28, standard: 440000, min: 425000, max: 455000 },
  { grade: 29, standard: 470000, min: 455000, max: 485000 },
  { grade: 30, standard: 500000, min: 485000, max: 515000 },
  { grade: 31, standard: 530000, min: 515000, max: 545000 },
  { grade: 32, standard: 560000, min: 545000, max: 575000 },
  { grade: 33, standard: 590000, min: 575000, max: 605000 },
  { grade: 34, standard: 620000, min: 605000, max: 635000 },
  { grade: 35, standard: 650000, min: 635000, max: 665000 },
  { grade: 36, standard: 680000, min: 665000, max: 695000 },
  { grade: 37, standard: 710000, min: 695000, max: 730000 },
  { grade: 38, standard: 750000, min: 730000, max: 770000 },
  { grade: 39, standard: 790000, min: 770000, max: 810000 },
  { grade: 40, standard: 830000, min: 810000, max: 855000 },
  { grade: 41, standard: 880000, min: 855000, max: 905000 },
  { grade: 42, standard: 930000, min: 905000, max: 955000 },
  { grade: 43, standard: 980000, min: 955000, max: 1005000 },
  { grade: 44, standard: 1030000, min: 1005000, max: 1055000 },
  { grade: 45, standard: 1090000, min: 1055000, max: 1115000 },
  { grade: 46, standard: 1150000, min: 1115000, max: 1175000 },
  { grade: 47, standard: 1210000, min: 1175000, max: 1235000 },
  { grade: 48, standard: 1270000, min: 1235000, max: 1295000 },
  { grade: 49, standard: 1330000, min: 1295000, max: 1355000 },
  { grade: 50, standard: 1390000, min: 1355000, max: null },
];

// 厚生年金の標準報酬月額は 88,000円（健保の4等級）〜650,000円（健保の35等級）。
export const KYOKAI_KENPO_PENSION_RANGE = { min: 88_000, max: 650_000 };

// 令和7年3月分（4月納付分）からの料率（広島・東京・大阪のリーフレット）。介護保険料率は 11.56%−9.97% = 1.59%（3支部とも同じ）。子ども・子育て支援金はなし。
const HEALTH_R7 = { '広島県': 0.0997, '東京都': 0.0991, '大阪府': 0.1024 };
// 令和8年3月分（4月納付分）からの料率（広島・福岡・大阪の保険料額表）。介護保険料率1.62%、子ども・子育て支援金0.23%（令和8年4月分〜）。
const HEALTH_R8 = { '広島県': 0.0978, '福岡県': 0.1011, '大阪府': 0.1013 };

const COMMON = {
  model: 'kyokaiKenpo',
  grades: KYOKAI_KENPO_GRADES,
  pension: { range: KYOKAI_KENPO_PENSION_RANGE, rate: 0.183 }, // 18.300%（全額）。平成29年9月分〜
  careAge: { min: 40, max: 64 }, // 介護保険第2号被保険者
  employeeShare: 0.5, // 折半
  // 保険料額表の注：事業主が給与から控除する被保険者負担分の端数は、50銭以下切り捨て・50銭超切り上げ（特約があれば別）。
  employeeRounding: 'halfDown',
};

// 年間の保険料は、月ごとの料率スケジュールで計算する（months 合計 = 12）。
export const KYOKAI_KENPO_2025 = {
  ...COMMON,
  schedule: [
    // 令和7年1〜2月分は令和6年度の料率（資料なし）のため、令和7年3月分からの料率で代用している。
    { months: 12, label: '令和7年3月分〜の料率（1〜2月分は令和6年度料率が未登録のため代用）', healthRateByPrefecture: HEALTH_R7, careRate: 0.0159, childSupportRate: 0 },
  ],
};

export const KYOKAI_KENPO_2026 = {
  ...COMMON,
  schedule: [
    { months: 2, label: '令和8年1〜2月分（令和7年度の料率）', healthRateByPrefecture: HEALTH_R7, careRate: 0.0159, childSupportRate: 0 },
    { months: 1, label: '令和8年3月分（令和8年度の料率・支援金なし）', healthRateByPrefecture: HEALTH_R8, careRate: 0.0162, childSupportRate: 0 },
    { months: 9, label: '令和8年4〜12月分（令和8年度の料率・支援金あり）', healthRateByPrefecture: HEALTH_R8, careRate: 0.0162, childSupportRate: 0.0023 },
  ],
};
