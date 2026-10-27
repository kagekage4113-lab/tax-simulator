import { h } from './dom.js';
import { buildExport, parseImport } from '../io/exchange.js';
import { defaultState } from '../core/schema.js';

export function dataSection(store) {
  const msg = h('p', { class: 'msg', role: 'status' });
  const show = (text, kind = '') => { msg.textContent = text; msg.className = `msg ${kind}`; };

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const result = parseImport(await file.text());
      if (!result.ok) { show(`読み込めませんでした（現在のデータは変更されていません）：${result.errors.slice(0, 3).join(' / ')}`, 'error'); return; }
      store.replace(result.state);
      show('読み込みました', 'ok');
    } catch {
      show('ファイルを読み込めませんでした（現在のデータは変更されていません）', 'error');
    }
  });

  const exportBtn = h('button', { type: 'button', class: 'btn', onClick: () => {
    const blob = new Blob([buildExport(store.get())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: `tax-simulator-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    show('JSONを書き出しました。個人情報を含むため、保管にご注意ください。', 'ok');
  } }, 'JSONを書き出す');

  const resetBtn = h('button', { type: 'button', class: 'btn danger', onClick: () => {
    if (confirm('入力内容をすべて初期化します。よろしいですか？（先にJSONの書き出しをおすすめします）')) {
      store.replace(defaultState());
      show('初期化しました', 'ok');
    }
  } }, '入力を初期化');

  return h('details', { class: 'card', id: 'sec-data', open: false },
    h('summary', {}, 'データ保存・復元'),
    h('div', { class: 'body' },
      h('p', { class: 'note' }, '入力内容はこの端末のブラウザ内にだけ自動保存されます。外部には送信されません。'),
      h('div', { class: 'row' }, exportBtn, h('button', { type: 'button', class: 'btn', onClick: () => fileInput.click() }, 'JSONを読み込む'), fileInput, resetBtn),
      msg));
}
