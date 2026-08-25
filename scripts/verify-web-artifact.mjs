import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { ROOT_DIR } from '../src/paths.mjs';

const distDir = path.join(ROOT_DIR, 'dist');

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  }))).flat();
}

const files = await listFiles(distDir);
const bundledPdfs = files.filter((file) => path.extname(file).toLowerCase() === '.pdf');

if (bundledPdfs.length > 0) {
  throw new Error(`Web配布物へPDFを同梱できません:\n${bundledPdfs.join('\n')}`);
}

console.log('Web配布物にPDFが含まれていないことを確認しました');
