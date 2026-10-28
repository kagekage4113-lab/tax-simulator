// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { scopeSection } from '../src/ui/scope.js';

describe('対応範囲の案内（ベータ版）', () => {
  it('対応・前提・未対応・確認中を示し、特定の地域や個人の例を含まない', () => {
    const t = scopeSection().textContent;
    expect(t).toMatch(/ベータ版/);
    expect(t).toMatch(/対応していること/);
    expect(t).toMatch(/東京23区の標準の値/);
    expect(t).toMatch(/未対応/);
    expect(t).toMatch(/確認中/);
    expect(t).not.toMatch(/福山|母72|透析/);
  });
});
