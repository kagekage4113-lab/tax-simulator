import { h } from './dom.js';
import { buildExport, parseImport } from '../io/exchange.js';
import { defaultState } from '../core/schema.js';
import { DEFAULT_YEAR, UI_YEARS, yearLabel } from '../data/taxYears/index.js';

// 画面が対応する年以外のデータは、対応する年（令和8年分）として読み込む。付け替えたときは注記を返す。
function adoptYear(state) {
  if (UI_YEARS.includes(state.taxYear)) return '';
  const note = `（${yearLabel(state.taxYear)}のデータを${yearLabel(DEFAULT_YEAR)}として読み込みました）`;
  state.taxYear = DEFAULT_YEAR;
  return note;
}

const fileName = () => `tax-simulator-${new Date().toISOString().slice(0, 10)}.json`;

// 「はい／いいえ」の確認。ボタンの場所に出して、押すまで何も変えない。誤って押しても安全な「いいえ」に最初のフォーカスを置く。
export function confirmInline({ question, yes, no = 'いいえ', onYes }) {
  const box = h('div', { class: 'confirm', role: 'alertdialog', 'aria-label': question, hidden: true });
  const noBtn = h('button', { type: 'button', class: 'btn', onClick: () => close() }, no);
  const yesBtn = h('button', { type: 'button', class: 'btn danger', onClick: () => { close(); onYes(); } }, yes);
  const close = () => { box.hidden = true; };
  box.append(h('p', { class: 'confirm-q' }, question), h('div', { class: 'row' }, noBtn, yesBtn));
  return { box, open: () => { box.hidden = false; noBtn.focus(); } };
}

export function dataSection(store) {
  const msg = h('p', { class: 'msg', role: 'status' });
  const show = (text, kind = '') => { msg.textContent = text; msg.className = `msg ${kind}`; };
  const fail = (result) => show(`読み込めませんでした（今の入力は変更されていません）：${result.errors.slice(0, 3).join(' / ')}`, 'error');
  const adopt = (text) => {
    const result = parseImport(text);
    if (!result.ok) { fail(result); return false; }
    const note = adoptYear(result.state);
    store.replace(result.state);
    show(`読み込みました${note}`, 'ok');
    return true;
  };

  // 画面にも内容を出して、保存やコピーができない環境でも手で控えられるようにする。
  const box = h('textarea', { class: 'json-box', rows: 6, readonly: true, hidden: true, 'aria-label': '保存データ（テキスト）', spellcheck: 'false' });
  const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* 許可されない環境では選択状態にして手動コピーしてもらう */ }
    try { box.hidden = false; box.select(); return document.execCommand('copy'); } catch { return false; }
  };

  // 保存: スマホは共有シート（「ファイルに保存」「メモ」「LINE」など）、パソコンはダウンロード。どちらも使えなければ下の欄から。
  const saveBtn = h('button', { type: 'button', class: 'btn primary', onClick: async () => {
    const text = buildExport(store.get());
    box.value = text;
    try {
      const file = new File([text], fileName(), { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'ざっくり税金シミュレーター 保存データ' });
          show('保存しました。共有メニューで「ファイルに保存」などを選ぶと残せます。', 'ok');
          return;
        } catch (e) {
          if (e && e.name === 'AbortError') { show('保存をやめました。', ''); return; }
        }
      }
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = h('a', { href: url, download: fileName() });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      show('保存しました（ダウンロードフォルダに入ります）。保存されないときは、下の「テキストでコピー」を使ってください。個人情報を含むため、保管にご注意ください。', 'ok');
    } catch {
      box.hidden = false; box.select();
      show('ファイルにできませんでした。下の欄の内容をコピーして、メモなどに貼り付けて残してください。', 'error');
    }
  } }, 'バックアップを保存');

  const copyBtn = h('button', { type: 'button', class: 'btn', onClick: async () => {
    const text = buildExport(store.get());
    box.value = text;
    const copied = await copyText(text);
    show(copied ? 'コピーしました。メモなどに貼り付けて残してください。' : '下の欄の内容を選んでコピーしてください。', copied ? 'ok' : '');
    if (!copied) { box.hidden = false; box.select(); }
  } }, 'テキストでコピー');

  // 読み込み: 端末のファイル（拡張子を問わない。スマホのファイル選択で灰色になって選べないことを避ける）
  const fileInput = h('input', { type: 'file', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try { adopt(await file.text()); } catch { show('ファイルを読み込めませんでした（今の入力は変更されていません）', 'error'); }
  });
  const loadBtn = h('button', { type: 'button', class: 'btn', onClick: () => fileInput.click() }, 'バックアップを読み込む');

  const pasteBox = h('textarea', { class: 'json-box', rows: 5, placeholder: 'コピーした保存データをここに貼り付け', 'aria-label': '読み込む保存データ', spellcheck: 'false' });
  const pasteBtn = h('button', { type: 'button', class: 'btn', onClick: () => { if (adopt(pasteBox.value)) pasteBox.value = ''; } }, '貼り付けた内容を読み込む');
  const clipBtn = h('button', { type: 'button', class: 'btn', onClick: async () => {
    try { if (adopt(await navigator.clipboard.readText())) pasteBox.value = ''; } catch { show('コピーした内容を読み取れませんでした。下の欄に貼り付けてから「貼り付けた内容を読み込む」を押してください。', ''); }
  } }, 'コピーしたものを読み込む');

  const reset = confirmInline({
    question: '入力内容をすべて消して、最初の状態に戻します。元に戻せません。よろしいですか？（先に「バックアップを保存」がおすすめです）',
    yes: 'はい、初期化する',
    onYes: () => { store.replace(defaultState()); show('初期化しました', 'ok'); },
  });
  const resetBtn = h('button', { type: 'button', class: 'btn danger', onClick: reset.open }, '入力を初期化');

  return h('details', { class: 'card', id: 'sec-data', open: false },
    h('summary', {}, 'データの保存・読み込み'),
    h('div', { class: 'body' },
      h('p', { class: 'note' }, '入力内容は、この端末のブラウザの中に自動で保存されます（外部には送りません）。機種変更やブラウザのデータ削除に備えて、ときどきバックアップを残しておくと安心です。'),
      h('div', { class: 'row' }, saveBtn, loadBtn, fileInput),
      h('div', { class: 'row' }, copyBtn, clipBtn),
      msg,
      box,
      h('details', { class: 'edit' }, h('summary', {}, '貼り付けて読み込む'), pasteBox, h('div', { class: 'row' }, pasteBtn)),
      h('hr', { class: 'sep' }),
      h('div', { class: 'row' }, resetBtn),
      reset.box));
}
