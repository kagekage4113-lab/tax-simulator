// localStorage への保存・復元。壊れたデータでもアプリが起動不能にならないようにする。
import { DATA_VERSION, defaultState, migrate, validateState } from './schema.js';

export const STORAGE_KEY = 'tax-simulator:state';
export const BACKUP_KEY = 'tax-simulator:state:corrupt-backup';

// 戻り値: { state, notice } notice は画面に出す案内（なければ null）
export function loadState(storage = safeStorage()) {
  if (!storage) return { state: defaultState(), notice: 'この環境ではブラウザ保存が使えません（入力はJSONで保存してください）' };
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { state: defaultState(), notice: '保存データを読み込めませんでした' };
  }
  if (raw == null) return { state: defaultState(), notice: null };
  try {
    const env = JSON.parse(raw);
    if (!env || !Number.isInteger(env.version) || env.version > DATA_VERSION) throw new Error('version');
    const data = migrate(env.data, env.version);
    const result = validateState(data);
    if (!result.state) throw new Error('invalid');
    // 一部の項目だけ不正な場合は、正規化済みの値（不正項目は既定値）で起動する。
    return { state: result.state, notice: result.ok ? null : '保存データの一部が不正だったため、該当項目を初期値に戻しました' };
  } catch {
    try { storage.setItem(BACKUP_KEY, raw); } catch { /* 容量不足などは無視 */ }
    return { state: defaultState(), notice: '保存データが壊れていたため初期状態で起動しました（元データは退避済み）' };
  }
}

export function saveState(state, storage = safeStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: DATA_VERSION, savedAt: Date.now(), data: state }));
    return true;
  } catch {
    return false;
  }
}

export function clearState(storage = safeStorage()) {
  try { storage?.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

function safeStorage() {
  try {
    const s = globalThis.localStorage;
    const k = '__probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}
