import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { parseIacharaText } from '../src/iachara-parser.mjs';
import { generateCharacterPdfFromAssets } from '../src/pdf-core.mjs';
import { CONFIG_PATH, FONT_PATH, ROOT_DIR } from '../src/paths.mjs';

const fixtureUrl = new URL('./fixtures/iachara-v2.txt', import.meta.url);

async function loadAssets() {
  const layoutConfig = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const [sourcePdfBytes, fontBytes] = await Promise.all([
    readFile(path.join(ROOT_DIR, layoutConfig.sourcePdf)),
    readFile(FONT_PATH),
  ]);
  return { sourcePdfBytes, fontBytes, layoutConfig };
}

test('ブラウザ用の純粋関数だけで編集可能PDFを生成できる', async () => {
  const character = parseIacharaText(await readFile(fixtureUrl, 'utf8'));
  const result = await generateCharacterPdfFromAssets(character, await loadAssets());
  const pdfDoc = await PDFDocument.load(result.bytes);
  const form = pdfDoc.getForm();

  assert.equal(form.getTextField('profile.name').getText(), 'テスト 探索者');
  assert.equal(form.getTextField('abilities.str.extreme').getText(), '10');
  assert.equal(form.getTextField('vitals.luck').getText(), '65');
  assert.equal(pdfDoc.getPageCount(), 3);
  assert.ok(result.fieldCount > 300);
});

test('ブラウザ用の純粋関数は画像の内容を検証する', async () => {
  const character = parseIacharaText(await readFile(fixtureUrl, 'utf8'));
  await assert.rejects(
    generateCharacterPdfFromAssets(character, {
      ...await loadAssets(),
      portraitBytes: new Uint8Array([0, 1, 2, 3]),
    }),
    /PNGまたはJPEG/,
  );
});
