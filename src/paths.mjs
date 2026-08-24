import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG_PATH = path.join(ROOT_DIR, 'config', 'template-layout.json');
export const BUILD_DIR = path.join(ROOT_DIR, 'build');
export const OUTPUT_DIR = path.join(ROOT_DIR, 'output', 'pdf');
export const TEMP_PDF_DIR = path.join(ROOT_DIR, 'tmp', 'pdfs');
export const DEFAULT_TEMPLATE_PATH = path.join(BUILD_DIR, 'normalized-template.pdf');
export const FONT_PATH = path.join(
  ROOT_DIR,
  'node_modules',
  '@expo-google-fonts',
  'noto-sans-jp',
  '400Regular',
  'NotoSansJP_400Regular.ttf',
);
