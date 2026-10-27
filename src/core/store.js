// 最小限の状態管理。subscribe(fn) の fn は変更のたびに呼ばれる。保存は debounce。
import { loadState, saveState } from './storage.js';

export function createStore({ debounceMs = 250 } = {}) {
  const { state: initial, notice } = loadState();
  let state = initial;
  const listeners = new Set();
  let timer = null;
  let saveOk = true;

  const flush = () => {
    clearTimeout(timer);
    timer = null;
    saveOk = saveState(state);
    listeners.forEach((fn) => fn(state, { type: 'saved', saveOk }));
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };

  return {
    notice,
    get: () => state,
    // mutator は state を直接書き換える関数。structural=true なら一覧など画面構造の再描画が必要。
    update(mutator, { structural = false } = {}) {
      mutator(state);
      listeners.forEach((fn) => fn(state, { type: 'change', structural }));
      schedule();
    },
    replace(next) {
      state = next;
      listeners.forEach((fn) => fn(state, { type: 'replace', structural: true }));
      flush();
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    flush,
    isSaveOk: () => saveOk,
  };
}
