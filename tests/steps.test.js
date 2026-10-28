// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createSteps, stepNav } from '../src/ui/steps.js';
import { h } from '../src/ui/dom.js';

const mk = (classic = false) => {
  document.body.innerHTML = '';
  window.location.hash = '';
  const panels = { input: h('section', {}, 'IN'), review: h('section', {}, 'RV', stepNav({ back: { id: 'input', label: '入力に戻る' }, next: { id: 'adjust', label: '調整へ' } })), adjust: h('section', {}, 'AD') };
  const steps = createSteps({ panels, classic });
  document.body.append(panels.input, panels.review, panels.adjust, steps.dock);
  return { panels, steps };
};
const tab = (id) => document.getElementById(`tab-${id}`);

describe('入力→確認→調整の切り替え', () => {
  it('最初は「入力」だけが見え、タブで切り替わる', () => {
    const { panels, steps } = mk();
    expect(steps.current()).toBe('input');
    expect([panels.input.hidden, panels.review.hidden, panels.adjust.hidden]).toEqual([false, true, true]);
    tab('review').click();
    expect(steps.current()).toBe('review');
    expect([panels.input.hidden, panels.review.hidden, panels.adjust.hidden]).toEqual([true, false, true]);
    expect(tab('review').getAttribute('aria-selected')).toBe('true');
    expect(tab('input').getAttribute('aria-selected')).toBe('false');
  });
  it('どこにある data-goto のボタンでも移動できる（前へ／次へ）', () => {
    const { panels, steps } = mk();
    tab('review').click();
    [...panels.review.querySelectorAll('button')].find((b) => b.textContent.includes('調整へ')).click();
    expect(steps.current()).toBe('adjust');
    tab('review').click();
    [...panels.review.querySelectorAll('button')].find((b) => b.textContent.includes('入力に戻る')).click();
    expect(steps.current()).toBe('input');
  });
  it('未回答の件数をバッジに出し、0件なら隠す。手取りの要約も更新できる', () => {
    const { steps } = mk();
    const badge = document.querySelector('.dk-badge');
    steps.setBadge(5);
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('5');
    steps.setBadge(0);
    expect(badge.hidden).toBe(true);
    steps.setSummary(3_931_470, 1_068_530);
    expect(document.querySelector('.dk-take').textContent).toBe('3,931,470円');
    expect(document.querySelector('.dk-burden').textContent).toBe('1,068,530円');
  });
  it('1ページ表示（classic）では全部が並び、タブは選択状態にならない。戻せる', () => {
    const { panels, steps } = mk(true);
    expect([panels.input.hidden, panels.review.hidden, panels.adjust.hidden]).toEqual([false, false, false]);
    expect(document.querySelector('.dock').classList.contains('classic')).toBe(true);
    steps.setClassic(false);
    expect([panels.input.hidden, panels.review.hidden, panels.adjust.hidden]).toEqual([false, true, true]);
  });
  it('URLの #review などで開き始められる', () => {
    document.body.innerHTML = '';
    window.location.hash = '#review';
    const panels = { input: h('section'), review: h('section'), adjust: h('section') };
    const steps = createSteps({ panels });
    expect(steps.current()).toBe('review');
    expect(panels.input.hidden).toBe(true);
  });
});

describe('下の要約: 「いま」の1段と、条件を変えたときの「もし」を足した2段', () => {
  const rowIf = () => document.querySelector('.dk-if');
  it('何もなければ1段。試算があると、調整の画面でだけ2段になり、差額も出る', () => {
    const { steps } = mk();
    steps.setSummary(3_964_156, 1_035_844);
    expect(rowIf().hidden).toBe(true);
    steps.setScenario({ takeHome: 5_194_827, burden: 1_455_173, takeDelta: 1_230_671, burdenDelta: 419_329 });
    expect(rowIf().hidden).toBe(true); // 入力の画面では出さない
    tab('adjust').click();
    expect(rowIf().hidden).toBe(false);
    expect(document.querySelector('.dock').classList.contains('two-rows')).toBe(true);
    expect(document.querySelector('.dk-take-if').textContent).toBe('5,194,827円');
    expect(document.querySelector('.dk-burden-if').textContent).toBe('1,455,173円');
    expect(document.querySelectorAll('.dk-delta')[0].textContent).toBe('+1,230,671');
    expect(document.querySelectorAll('.dk-delta')[1].textContent).toBe('+419,329');
    expect(document.querySelector('.dk-take').textContent).toBe('3,964,156円'); // 「いま」は動かない
    tab('review').click();
    expect(rowIf().hidden).toBe(true);
    tab('adjust').click();
    steps.setScenario(null);
    expect(rowIf().hidden).toBe(true);
    expect(document.querySelector('.dock').classList.contains('two-rows')).toBe(false);
  });
  it('↓で数字をたたみ、押すと戻る。たたんだ状態は覚えておく', () => {
    localStorage.removeItem('taxsim.dock');
    const { steps } = mk();
    const dock = document.querySelector('.dock');
    const toggle = document.querySelector('.dk-toggle');
    expect(dock.classList.contains('collapsed')).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    toggle.click();
    expect(dock.classList.contains('collapsed')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toMatch(/手取りを表示/);
    mk(); // 作り直しても、たたんだまま
    expect(document.querySelector('.dock').classList.contains('collapsed')).toBe(true);
    document.querySelector('.dk-toggle').click();
    expect(document.querySelector('.dock').classList.contains('collapsed')).toBe(false);
    expect(steps.current()).toBe('input');
  });
  it('2回目以降の更新は短く数え上げる（動きを減らす設定のときは、すぐ表示）', async () => {
    const { steps } = mk();
    steps.setSummary(1_000_000, 100_000);
    steps.setSummary(2_000_000, 200_000);
    const mid = document.querySelector('.dk-take').textContent;
    expect(mid).not.toBe('—');
    await new Promise((r) => setTimeout(r, 500));
    expect(document.querySelector('.dk-take').textContent).toBe('2,000,000円');
    expect(document.querySelector('.dk-burden').textContent).toBe('200,000円');
  });
});
