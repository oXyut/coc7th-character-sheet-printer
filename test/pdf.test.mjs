import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  decodePDFRawStream,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFTextField,
} from 'pdf-lib';
import { parseIacharaText } from '../src/iachara-parser.mjs';
import { generateCharacterPdf } from '../src/pdf-writer.mjs';
import { createNormalizedTemplate } from '../src/template-builder.mjs';

const fixtureUrl = new URL('./fixtures/iachara-v2.txt', import.meta.url);

test('正規化マスタの項目IDと矩形が一意である', async () => {
  const template = await createNormalizedTemplate();
  const ids = template.layout.fields.map((field) => field.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('profile.name'));
  assert.ok(ids.includes('skills.fixed.electronicEngineering.regular'));
  assert.ok(ids.includes('vitals.luck'));
  assert.ok(ids.includes('portrait'));
  for (const item of template.layout.fields) {
    assert.ok(item.page === 0 || item.page === 1);
    assert.ok(item.rect.width > 0 && item.rect.height > 0);
  }
  const luck = template.layout.fields.find((field) => field.id === 'vitals.luck');
  assert.equal(luck.page, 0);
  assert.deepEqual(luck.rect, { x: 188.5, y: 490.72, width: 15, height: 11.212 });
  assert.equal(luck.align, 'center');
  assert.equal(luck.fontSize, 6);
});

test('編集可能PDFへ値と外観ストリームを書き込む', async () => {
  const character = parseIacharaText(await readFile(fixtureUrl, 'utf8'));
  const result = await generateCharacterPdf(character);
  const pdfDoc = await PDFDocument.load(result.bytes);
  const form = pdfDoc.getForm();
  assert.equal(form.getTextField('profile.name').getText(), 'テスト 探索者');
  assert.equal(form.getTextField('abilities.str.hard').getText(), '25');
  assert.equal(form.getTextField('vitals.luck').getText(), '65');
  assert.equal(form.getTextField('skills.fixed.electronicEngineering.regular').getText(), '45');
  assert.equal(form.getTextField('skills.custom.0.name').getText(), '独自技能');
  assert.equal(pdfDoc.getPageCount(), 3);
  for (const id of ['profile.name', 'abilities.str.regular', 'skills.fixed.electronicEngineering.regular']) {
    const field = form.getField(id);
    assert.ok(field instanceof PDFTextField);
    for (const widget of field.acroField.getWidgets()) assert.ok(widget.getNormalAppearance());
  }
});

test('文字フォームの外観は必要な項目以外で原本を白く塗りつぶさない', async () => {
  const character = parseIacharaText(await readFile(fixtureUrl, 'utf8'));
  const result = await generateCharacterPdf(character);
  const pdfDoc = await PDFDocument.load(result.bytes);
  const form = pdfDoc.getForm();
  for (const id of ['vitals.luck', 'abilities.str.extreme', 'skills.fixed.electronicEngineering.regular']) {
    const field = form.getTextField(id);
    for (const widget of field.acroField.getWidgets()) {
      const appearance = pdfDoc.context.lookup(widget.getNormalAppearance());
      assert.ok(appearance instanceof PDFRawStream);
      const operators = new TextDecoder().decode(decodePDFRawStream(appearance).decode());
      assert.doesNotMatch(operators, /(?:^|\n)1 1 1 rg(?:\n|$)/);
    }
  }

  const placeholderField = form.getTextField('vitals.hpMax');
  for (const widget of placeholderField.acroField.getWidgets()) {
    assert.equal(widget.getAppearanceCharacteristics()?.getBackgroundColor(), undefined);
    const appearance = pdfDoc.context.lookup(widget.getNormalAppearance());
    assert.ok(appearance instanceof PDFRawStream);
    const operators = new TextDecoder().decode(decodePDFRawStream(appearance).decode());
    assert.match(operators, /(?:^|\n)1 1 1 rg(?:\n|$)/);
  }
});

test('空のフォーム欄は描画内容のない外観を持つ', async () => {
  const character = parseIacharaText(await readFile(fixtureUrl, 'utf8'));
  const result = await generateCharacterPdf(character);
  const pdfDoc = await PDFDocument.load(result.bytes);
  const form = pdfDoc.getForm();
  for (const id of ['backstory.injuries', 'equipment.1']) {
    const field = form.getTextField(id);
    assert.equal(field.getText(), undefined);
    for (const widget of field.acroField.getWidgets()) {
      const appearance = pdfDoc.context.lookup(widget.getNormalAppearance());
      assert.ok(appearance instanceof PDFRawStream);
      assert.equal(decodePDFRawStream(appearance).decode().length, 0);
    }
  }
});

test('付録のURLと日本語を文字化けせず抽出できる', async (t) => {
  const probe = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' });
  if (probe.error?.code === 'ENOENT') {
    t.skip('pdftotextが利用できません');
    return;
  }
  const character = parseIacharaText(await readFile(fixtureUrl, 'utf8'));
  const result = await generateCharacterPdf(character);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'coc7-text-'));
  const pdfPath = path.join(directory, 'character.pdf');
  await writeFile(pdfPath, result.bytes);
  const extracted = spawnSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' });
  assert.equal(extracted.status, 0, extracted.stderr);
  assert.ok(extracted.stdout.includes(character.iconUrl));
  assert.ok(extracted.stdout.includes('すぐ確認できます。'));
});

test('固定化PDFからAcroFormとWidgetを除去する', async () => {
  const character = parseIacharaText(await readFile(fixtureUrl, 'utf8'));
  const result = await generateCharacterPdf(character, { flatten: true });
  const pdfDoc = await PDFDocument.load(result.bytes);
  assert.equal(pdfDoc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict), undefined);
  for (const page of pdfDoc.getPages()) {
    const annots = page.node.Annots();
    assert.equal(annots?.size() ?? 0, 0);
  }
});

test('ローカルPNGを立ち絵欄の外観へ設定する', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'coc7-portrait-'));
  const portraitPath = path.join(directory, 'portrait.png');
  await writeFile(
    portraitPath,
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zt9sAAAAASUVORK5CYII=', 'base64'),
  );
  const character = parseIacharaText(await readFile(fixtureUrl, 'utf8'));
  const result = await generateCharacterPdf(character, { portraitPath });
  const pdfDoc = await PDFDocument.load(result.bytes);
  const button = pdfDoc.getForm().getButton('portrait');
  for (const widget of button.acroField.getWidgets()) assert.ok(widget.getNormalAppearance());
});
