import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFTextField } from 'pdf-lib';
import { BUILD_DIR, FONT_PATH } from '../src/paths.mjs';
import { createNormalizedTemplate } from '../src/template-builder.mjs';

try {
  const [template, fontBytes] = await Promise.all([
    createNormalizedTemplate(),
    readFile(FONT_PATH),
  ]);
  const pdfDoc = await PDFDocument.load(template.bytes, { updateMetadata: false });
  pdfDoc.registerFontkit(fontkit);
  const font = await pdfDoc.embedFont(fontBytes, {
    subset: false,
    features: { locl: false },
  });
  const form = pdfDoc.getForm();
  if (form.getFields().length !== template.layout.fields.length) {
    throw new Error(`項目数が一致しません: ${form.getFields().length} != ${template.layout.fields.length}`);
  }
  const layoutById = new Map(template.layout.fields.map((item) => [item.id, item]));

  for (const field of form.getFields()) {
    if (!(field instanceof PDFTextField)) continue;
    const name = field.getName();
    field.setFontSize(layoutById.get(name)?.fontSize ?? 6);
    if (name === 'vitals.luck') field.setText('65');
    else if (name.endsWith('.hard')) field.setText('44');
    else if (name.endsWith('.extreme')) field.setText('17');
    else if (name.endsWith('.regular')) field.setText('88');
    else if (name.endsWith('.name')) field.setText('日本語確認');
    else if (name.startsWith('backstory.')) field.setText('日本語の複数行表示を確認します。\n二行目です。');
    else field.setText('確認');
  }
  form.updateFieldAppearances(font);
  const bytes = await pdfDoc.save({ updateFieldAppearances: false, useObjectStreams: false });
  await mkdir(BUILD_DIR, { recursive: true });
  const outputPath = path.join(BUILD_DIR, 'template-verification.pdf');
  await writeFile(outputPath, bytes);

  const renderDir = path.join(BUILD_DIR, 'template-verification-pages');
  await mkdir(renderDir, { recursive: true });
  const render = spawnSync('pdftoppm', [
    '-png', '-r', '120', outputPath, path.join(renderDir, 'page'),
  ], { encoding: 'utf8' });
  if (render.error?.code !== 'ENOENT' && render.status !== 0) {
    throw new Error(`PDFレンダリングに失敗しました: ${render.stderr || render.error?.message}`);
  }
  console.log(`配置確認PDFを生成しました: ${outputPath}`);
  console.log(`フォーム項目数: ${form.getFields().length}`);
  if (render.error?.code === 'ENOENT') console.warn('pdftoppmがないためPNGレンダリングは省略しました');
  else console.log(`確認画像: ${renderDir}`);
} catch (error) {
  console.error(`PDFマスタの検証に失敗しました: ${error.message}`);
  process.exitCode = 1;
}
