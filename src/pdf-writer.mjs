import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { FONT_PATH, ROOT_DIR } from './paths.mjs';
import { generateCharacterPdfFromAssets, wrapLine } from './pdf-core.mjs';
import { loadLayoutConfig } from './template-builder.mjs';

export async function generateCharacterPdf(character, options = {}) {
  const layoutConfig = await loadLayoutConfig();
  const [sourcePdfBytes, fontBytes, portraitBytes] = await Promise.all([
    readFile(path.join(ROOT_DIR, layoutConfig.sourcePdf)),
    readFile(FONT_PATH),
    options.portraitPath ? readFile(options.portraitPath) : Promise.resolve(null),
  ]);
  return generateCharacterPdfFromAssets(character, {
    sourcePdfBytes,
    fontBytes,
    layoutConfig,
    portraitBytes,
    flatten: Boolean(options.flatten),
  });
}

export async function writeCharacterPdf(character, outputPath, options = {}) {
  const result = await generateCharacterPdf(character, options);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, result.bytes);
  return { ...result, outputPath };
}

export { generateCharacterPdfFromAssets, wrapLine };
