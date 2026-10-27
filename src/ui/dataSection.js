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

  // ダウンロードできない環境（埋め込み表示など）でも使えるよう、内容を画面にも出して、コピー・貼り付けで受け渡せるようにする。
  const box = h('textarea', { class: 'json-box', rows: 8, readonly: true, hidden: true, 'aria-label': '書き出したJSON', spellcheck: 'false' });
  const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* 許可されない環境では選択状態にして手動コピーしてもらう */ }
    try { box.select(); return document.execCommand('copy'); } catch { return false; }
  };
  const exportBtn = h('button', { type: 'button', class: 'btn', onClick: async () => {
    const text = buildExport(store.get());
    box.value = text; box.hidden = false; box.focus(); box.select();
    try {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = h('a', { href: url, download: `tax-simulator-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { /* ダウンロードできない場合は下の欄から */ }
    const copied = await copyText(text);
    show(`JSONを書き出しました${copied ? '（クリップボードにもコピーしました）' : ''}。ファイルが保存されない場合は、下の欄の内容をコピーしてください。個人情報を含むため、保管にご注意ください。`, 'ok');
  } }, 'JSONを書き出す');

  const pasteBox = h('textarea', { class: 'json-box', rows: 5, placeholder: '書き出したJSONをここに貼り付け', 'aria-label': '読み込むJSON', spellcheck: 'false' });
  const pasteBtn = h('button', { type: 'button', class: 'btn', onClick: () => {
    const result = parseImport(pasteBox.value);
    if (!result.ok) { show(`読み込めませんでした（現在のデータは変更されていません）：${result.errors.slice(0, 3).join(' / ')}`, 'error'); return; }
    store.replace(result.state);
    pasteBox.value = '';
    show('読み込みました', 'ok');
  } }, '貼り付けた内容を読み込む');

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
      msg,
      box,
      h('details', { class: 'edit' }, h('summary', {}, '貼り付けで読み込む'), pasteBox, h('div', { class: 'row' }, pasteBtn))));
}
