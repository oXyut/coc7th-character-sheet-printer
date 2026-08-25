import fontUrl from '@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf?url';
import layoutConfig from '../config/template-layout.json';

let assetPromise;

async function fetchBytes(url, label) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label}を読み込めませんでした (${response.status})`);
  return new Uint8Array(await response.arrayBuffer());
}

export function loadBrowserPdfAssets() {
  assetPromise ??= fetchBytes(fontUrl, '日本語フォント').then((fontBytes) => ({
    fontBytes,
    layoutConfig,
  }));
  return assetPromise;
}
