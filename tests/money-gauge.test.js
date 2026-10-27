import { describe, expect, it } from 'vitest';
import { formatYen, parseYen } from '../src/core/money.js';
import { clampForSlider, sliderMaxFor, snapToStep } from '../src/core/gauge.js';

describe('parseYen', () => {
  it('全角・カンマ・円記号を受け付ける', () => {
    expect(parseYen('１，２３４，５６７円')).toBe(1234567);
    expect(parseYen('¥500,000')).toBe(500000);
  });
  it('空・不正は null', () => {
    expect(parseYen('')).toBeNull();
    expect(parseYen('abc')).toBeNull();
    expect(parseYen('12.5')).toBeNull();
    expect(parseYen('-100')).toBeNull(); // 負数は既定で不可
  });
  it('負数を許可した場合のみマイナス可', () => {
    expect(parseYen('-100000', { allowNegative: true })).toBe(-100000);
    expect(parseYen('−100000', { allowNegative: true })).toBe(-100000);
    expect(parseYen('-', { allowNegative: true })).toBeNull();
  });
  it('安全な整数範囲を超える値は拒否または上限に丸める', () => {
    expect(parseYen('99999999999999999999')).toBeNull();
    expect(parseYen('99999999999999')).toBe(9_999_999_999_999);
  });
  it('formatYen', () => {
    expect(formatYen(1234567)).toBe('1,234,567');
    expect(formatYen(NaN)).toBe('');
  });
});

describe('gauge', () => {
  it('範囲外の値でもゲージ最大を広げ、値自体は失わない', () => {
    expect(sliderMaxFor(1_000_000, 5_000_000, 10_000)).toBe(5_000_000);
    expect(sliderMaxFor(5_000_001, 5_000_000, 10_000)).toBe(5_010_000);
    expect(clampForSlider(7_000_000, 0, 5_000_000)).toBe(5_000_000);
    expect(clampForSlider(-5, 0, 100)).toBe(0);
  });
  it('step にそろえる', () => {
    expect(snapToStep(123_456, 10_000)).toBe(120_000);
    expect(snapToStep(125_000, 10_000)).toBe(130_000);
  });
});
