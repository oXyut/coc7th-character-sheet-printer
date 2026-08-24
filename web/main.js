import { parseIacharaText } from '../src/iachara-parser.mjs';
import './styles.css';

const elements = {
  form: document.querySelector('#converter-form'),
  txtInput: document.querySelector('#txt-input'),
  txtDrop: document.querySelector('#txt-drop'),
  txtMeta: document.querySelector('#txt-meta'),
  portraitInput: document.querySelector('#portrait-input'),
  portraitDrop: document.querySelector('#portrait-drop'),
  portraitMeta: document.querySelector('#portrait-meta'),
  portraitPreview: document.querySelector('#portrait-preview'),
  portraitClear: document.querySelector('#portrait-clear'),
  flatten: document.querySelector('#flatten'),
  submit: document.querySelector('#submit-button'),
  status: document.querySelector('#status'),
  error: document.querySelector('#error'),
  result: document.querySelector('#result'),
  resultTitle: document.querySelector('#result-title'),
  resultMeta: document.querySelector('#result-meta'),
  warnings: document.querySelector('#warnings'),
  download: document.querySelector('#download-link'),
};

let txtFile;
let portraitFile;
let parsedCharacter;
let outputUrl;
let previewUrl;
const worker = new Worker(new URL('./pdf.worker.mjs', import.meta.url), { type: 'module' });

function setStatus(message) {
  elements.status.textContent = message;
}

function clearError() {
  elements.error.hidden = true;
  elements.error.textContent = '';
}

function showError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
  elements.error.focus();
  setStatus('入力内容を確認してください。');
}

function updateSubmit() {
  elements.submit.disabled = !parsedCharacter || elements.form.getAttribute('aria-busy') === 'true';
}

function setBusy(busy) {
  elements.form.setAttribute('aria-busy', String(busy));
  elements.submit.textContent = busy ? 'PDFを生成しています…' : 'PDFを生成';
  updateSubmit();
}

function safeOutputName(fileName) {
  return `${fileName.replace(/\.[^.]+$/, '') || 'character'}-character-sheet.pdf`;
}

function formatVersion(version) {
  return [version.major, version.minor, version.patch].join('.');
}

function setTxtMeta(characterName, detail) {
  const name = document.createElement('strong');
  name.textContent = characterName;
  const description = document.createElement('span');
  description.textContent = detail;
  elements.txtMeta.replaceChildren(name, description);
}

async function useTxtFile(file) {
  clearError();
  elements.result.hidden = true;
  parsedCharacter = undefined;
  txtFile = file;
  if (!file) {
    elements.txtMeta.textContent = 'ファイルが選択されていません';
    updateSubmit();
    return;
  }
  setStatus('TXTを読み取っています。');
  try {
    const text = await file.text();
    parsedCharacter = parseIacharaText(text);
    setTxtMeta(parsedCharacter.basic['名前'], `${file.name} · 7版 v${formatVersion(parsedCharacter.version)}`);
    setStatus('入力内容を確認しました。PDFを生成できます。');
  } catch (error) {
    showError(error instanceof Error ? error.message : 'TXTを読み取れませんでした');
  }
  updateSubmit();
}

function clearPortrait() {
  portraitFile = undefined;
  elements.portraitInput.value = '';
  elements.portraitMeta.textContent = '画像なしでも生成できます';
  elements.portraitPreview.hidden = true;
  elements.portraitPreview.removeAttribute('src');
  elements.portraitClear.hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = undefined;
}

async function usePortraitFile(file) {
  clearError();
  if (!file) {
    clearPortrait();
    return;
  }
  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    showError('立ち絵はPNGまたはJPEGを指定してください');
    return;
  }
  portraitFile = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  elements.portraitPreview.src = previewUrl;
  elements.portraitPreview.hidden = false;
  elements.portraitClear.hidden = false;
  elements.portraitMeta.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
}

function setupDropZone(zone, input, onFile) {
  for (const eventName of ['dragenter', 'dragover']) {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.add('is-dragging');
    });
  }
  for (const eventName of ['dragleave', 'drop']) {
    zone.addEventListener(eventName, (event) => {
      event.preventDefault();
      zone.classList.remove('is-dragging');
    });
  }
  zone.addEventListener('drop', (event) => {
    const [file] = event.dataTransfer.files;
    if (file) onFile(file);
  });
  input.addEventListener('change', () => onFile(input.files[0]));
}

setupDropZone(elements.txtDrop, elements.txtInput, useTxtFile);
setupDropZone(elements.portraitDrop, elements.portraitInput, usePortraitFile);
elements.portraitClear.addEventListener('click', clearPortrait);

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!txtFile || !parsedCharacter) return;
  clearError();
  elements.result.hidden = true;
  setBusy(true);
  setStatus('PDFマスタと日本語フォントを準備しています。初回は数秒かかります。');
  try {
    const text = await txtFile.text();
    const portraitBuffer = portraitFile ? await portraitFile.arrayBuffer() : null;
    worker.postMessage({ type: 'generate', text, portraitBuffer, flatten: elements.flatten.checked }, portraitBuffer ? [portraitBuffer] : []);
    setStatus('キャラクターシートを生成しています。');
  } catch (error) {
    setBusy(false);
    showError(error instanceof Error ? error.message : 'ファイルを読み取れませんでした');
  }
});

worker.addEventListener('message', ({ data }) => {
  setBusy(false);
  if (data.type === 'error') {
    showError(data.message);
    return;
  }
  if (data.type !== 'success') return;
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl = URL.createObjectURL(new Blob([data.bytes], { type: 'application/pdf' }));
  elements.download.href = outputUrl;
  elements.download.download = safeOutputName(txtFile.name);
  elements.resultTitle.textContent = `${data.characterName} のPDFができました`;
  elements.resultMeta.textContent = `${2 + data.appendixPageCount}ページ · 付録${data.appendixPageCount}ページ${elements.flatten.checked ? ' · 印刷用に固定化' : ' · 編集可能'}`;
  elements.warnings.replaceChildren(...data.warnings.map((warning) => {
    const item = document.createElement('li');
    item.textContent = warning;
    return item;
  }));
  elements.warnings.hidden = data.warnings.length === 0;
  elements.result.hidden = false;
  elements.result.focus();
  setStatus('ダウンロードの準備ができました。');
});

worker.addEventListener('error', () => {
  setBusy(false);
  showError('PDF生成処理を開始できませんでした。ページを再読み込みしてください。');
});

window.addEventListener('beforeunload', () => {
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  worker.terminate();
});
