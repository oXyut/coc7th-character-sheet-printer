import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  BUILD_DIR,
  CONFIG_PATH,
  DEFAULT_TEMPLATE_PATH,
  FONT_PATH,
  ROOT_DIR,
} from './paths.mjs';
import {
  blankEmptyTextAppearances,
  createNormalizedTemplateFromAssets,
} from './template-core.mjs';

export async function loadLayoutConfig() {
  return JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
}

export async function createNormalizedTemplate() {
  const layoutConfig = await loadLayoutConfig();
  const [sourcePdfBytes, fontBytes] = await Promise.all([
    readFile(path.join(ROOT_DIR, layoutConfig.sourcePdf)),
    readFile(FONT_PATH),
  ]);
  return createNormalizedTemplateFromAssets({ sourcePdfBytes, fontBytes, layoutConfig });
}

export async function buildNormalizedTemplate(outputPath = DEFAULT_TEMPLATE_PATH) {
  const result = await createNormalizedTemplate();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await Promise.all([
    writeFile(outputPath, result.bytes),
    writeFile(
      path.join(path.dirname(outputPath), 'normalized-template.layout.json'),
      `${JSON.stringify(result.layout, null, 2)}\n`,
      'utf8',
    ),
  ]);
  return { ...result, outputPath };
}

export {
  blankEmptyTextAppearances,
  BUILD_DIR,
  createNormalizedTemplateFromAssets,
};
