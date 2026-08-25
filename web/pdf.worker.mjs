import { parseIacharaText } from '../src/iachara-parser.mjs';
import { generateCharacterPdfFromAssets } from '../src/pdf-core.mjs';
import { loadBrowserPdfAssets } from './browser-assets.mjs';

self.onmessage = async ({ data }) => {
  if (data.type !== 'generate') return;
  try {
    const character = parseIacharaText(data.text);
    const assets = await loadBrowserPdfAssets();
    const result = await generateCharacterPdfFromAssets(character, {
      ...assets,
      sourcePdfBytes: new Uint8Array(data.sourcePdfBuffer),
      portraitBytes: data.portraitBuffer ? new Uint8Array(data.portraitBuffer) : null,
      flatten: Boolean(data.flatten),
    });
    const bytes = result.bytes;
    const transferable = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    self.postMessage({
      type: 'success',
      bytes: transferable,
      warnings: result.warnings,
      appendixPageCount: result.appendixPageCount,
      fieldCount: result.fieldCount,
      characterName: character.basic['名前'],
    }, [transferable]);
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'PDF生成に失敗しました',
    });
  }
};
