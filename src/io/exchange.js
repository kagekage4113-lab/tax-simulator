// JSON のエクスポート/インポート。不正データは既存データを触る前に拒否する。
import { APP_ID, DATA_VERSION, migrate, validateState } from '../core/schema.js';

export function buildExport(state, now = new Date()) {
  return JSON.stringify({ app: APP_ID, version: DATA_VERSION, exportedAt: now.toISOString(), data: state }, null, 2);
}

// 戻り値: { ok: true, state } | { ok: false, errors }
export function parseImport(text) {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, errors: ['ファイルが空です'] };
  if (text.length > 5_000_000) return { ok: false, errors: ['ファイルが大きすぎます'] };
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['JSONとして読み込めません'] };
  }
  if (!json || typeof json !== 'object' || json.app !== APP_ID) return { ok: false, errors: ['このアプリのデータではありません'] };
  if (!Number.isInteger(json.version) || json.version < 1) return { ok: false, errors: ['データ形式のバージョンが不正です'] };
  if (json.version > DATA_VERSION) return { ok: false, errors: [`新しい形式(v${json.version})のデータです。アプリを更新してください`] };
  let data;
  try {
    data = migrate(json.data, json.version);
  } catch (e) {
    return { ok: false, errors: [e.message] };
  }
  const result = validateState(data);
  // インポートは厳格: 1つでも不正があれば全体を拒否し、既存データを守る。
  if (!result.ok) return { ok: false, errors: result.errors };
  return { ok: true, state: result.state };
}
