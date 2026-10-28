// 公的年金等に係る雑所得（国税庁 No.1600 の速算表）。期待値は表から手計算した値。
import { describe, expect, it } from 'vitest';
import { publicPensionIncome } from '../src/calc/pension.js';
import { getTaxYear } from '../src/data/taxYears/index.js';

const T = getTaxYear(2025).publicPension;

describe('公的年金等に係る雑所得（年金以外の合計所得金額が1,000万円以下）', () => {
  it('65歳以上: 110万円以下は0、110万円超330万円未満は 収入−110万円', () => {
    expect(publicPensionIncome(1_100_000, 65, T)).toBe(0);
    expect(publicPensionIncome(1_100_001, 65, T)).toBe(1);
    expect(publicPensionIncome(1_940_000, 73, T)).toBe(840_000);
    expect(publicPensionIncome(3_299_999, 70, T)).toBe(2_199_999);
  });
  it('65歳以上: 330万円以上は ×0.75−27.5万円 …（資料の具体例: 350万円 → 235万円）', () => {
    expect(publicPensionIncome(3_300_000, 65, T)).toBe(2_200_000);
    expect(publicPensionIncome(3_500_000, 65, T)).toBe(2_350_000);
    expect(publicPensionIncome(4_100_000, 65, T)).toBe(2_800_000); // 410万×0.85−68.5万 = 348.5万−68.5万
    expect(publicPensionIncome(7_700_000, 65, T)).toBe(5_860_000); // 770万×0.95−145.5万
    expect(publicPensionIncome(10_000_000, 65, T)).toBe(8_050_000); // 1,000万−195万
  });
  it('65歳未満: 60万円以下は0、60万円超130万円未満は 収入−60万円、130万円以上は ×0.75−27.5万円', () => {
    expect(publicPensionIncome(600_000, 64, T)).toBe(0);
    expect(publicPensionIncome(1_000_000, 64, T)).toBe(400_000);
    expect(publicPensionIncome(1_300_000, 64, T)).toBe(700_000);
    expect(publicPensionIncome(4_100_000, 60, T)).toBe(2_800_000);
  });
});

describe('年金以外の所得による区分', () => {
  it('1,000万円超2,000万円以下: 65歳以上は100万円以下が0、×0.75−17.5万円', () => {
    expect(publicPensionIncome(1_000_000, 65, T, 15_000_000)).toBe(0);
    expect(publicPensionIncome(2_000_000, 65, T, 15_000_000)).toBe(1_000_000);
    expect(publicPensionIncome(3_300_000, 65, T, 15_000_000)).toBe(2_300_000);
  });
  it('2,000万円超: 65歳以上は90万円以下が0、×0.75−7.5万円', () => {
    expect(publicPensionIncome(900_000, 65, T, 25_000_000)).toBe(0);
    expect(publicPensionIncome(3_300_000, 65, T, 25_000_000)).toBe(2_400_000);
  });
  it('表が未登録なら null（推測しない）', () => {
    expect(publicPensionIncome(1_940_000, 73, undefined)).toBeNull();
  });
});
