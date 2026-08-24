import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseIacharaText } from '../src/iachara-parser.mjs';
import { OUTPUT_DIR } from '../src/paths.mjs';
import { writeCharacterPdf } from '../src/pdf-writer.mjs';

function usage() {
  return `使い方:
  npm run print -- <input.txt|-> [options]

オプション:
  -o, --output <path>  出力先PDF
  --portrait <path>    PNGまたはJPEGの立ち絵
  --flatten            フォームを固定化する
  -h, --help           このヘルプを表示する`;
}

function parseArguments(argv) {
  const options = { input: null, output: null, portraitPath: null, flatten: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '-h' || argument === '--help') return { ...options, help: true };
    if (argument === '--flatten') {
      options.flatten = true;
      continue;
    }
    if (argument === '-o' || argument === '--output') {
      options.output = argv[++index];
      if (!options.output) throw new Error(`${argument} には出力先が必要です`);
      continue;
    }
    if (argument === '--portrait') {
      options.portraitPath = argv[++index];
      if (!options.portraitPath) throw new Error('--portrait には画像パスが必要です');
      continue;
    }
    if (argument.startsWith('-') && argument !== '-') throw new Error(`未知のオプションです: ${argument}`);
    if (options.input) throw new Error('入力ファイルは1つだけ指定してください');
    options.input = argument;
  }
  return options;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    process.exit(0);
  }
  if (!options.input) throw new Error(`入力ファイルを指定してください\n\n${usage()}`);
  const text = options.input === '-' ? await readStdin() : await readFile(options.input, 'utf8');
  const character = parseIacharaText(text);
  const defaultName = `${path.parse(options.input === '-' ? character.basic['名前'] : options.input).name}-character-sheet.pdf`;
  const outputPath = path.resolve(options.output ?? path.join(OUTPUT_DIR, defaultName));
  const result = await writeCharacterPdf(character, outputPath, {
    portraitPath: options.portraitPath ? path.resolve(options.portraitPath) : null,
    flatten: options.flatten,
  });
  console.log(`PDFを生成しました: ${result.outputPath}`);
  console.log(`付録ページ数: ${result.appendixPageCount}`);
  if (result.warnings.length) {
    console.warn(`警告 (${result.warnings.length}件):`);
    for (const warning of result.warnings) console.warn(`- ${warning}`);
  }
} catch (error) {
  console.error(`変換に失敗しました: ${error.message}`);
  process.exitCode = 1;
}
