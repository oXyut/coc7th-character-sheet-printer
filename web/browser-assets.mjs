import fontUrl from '@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf?url';
import layoutConfig from '../config/template-layout.json';
import sourcePdfUrl from '../CoC7JP-Sheet-Modern入力可.pdf?url';

let assetPromise;

async function fetchBytes(url, label) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label}を読み込めませんでした (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

export function loadBrowserPdfAssets() {
  assetPromise ??= Promise.all([
    fetchBytes(sourcePdfUrl, 'PDF原本'),
    fetchBytes(fontUrl, '日本語フォント'),
  ]).then(([sourcePdfBytes, fontBytes]) => ({
    sourcePdfBytes,
    fontBytes,
    layoutConfig,
  }));
  return assetPromise;
}
