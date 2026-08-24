import { buildNormalizedTemplate } from '../src/template-builder.mjs';

try {
  const result = await buildNormalizedTemplate();
  console.log(`正規化済みPDFマスタを生成しました: ${result.outputPath}`);
  console.log(`フォーム項目数: ${result.layout.fields.length}`);
} catch (error) {
  console.error(`PDFマスタの生成に失敗しました: ${error.message}`);
  process.exitCode = 1;
}
