# coc7th-character-sheet-printer

いあきゃらの「テキスト出力（7版 v2系）」を読み込み、入力可能な現代探索者シートPDFへ変換するNode.js CLIです。

原本PDFのフォーム名・日本語フォント・数値欄座標には不整合があるため、印刷のたびに原本のフォームを除去し、安定した項目IDを持つPDFマスタを再構築します。原本の `CoC7JP-Sheet-Modern入力可.pdf` 自体は変更しません。

## 必要環境

- Node.js 20以上
- npm
- `pdftoppm`（配置確認画像を生成する場合のみ）

```sh
npm install
```

## 使い方

いあきゃらのキャラクター画面から「テキスト出力」を保存し、そのファイルを指定します。

```sh
npm run print -- "/path/to/character.txt"
```

既定では `output/pdf/<入力名>-character-sheet.pdf` が生成されます。

```sh
# 出力先を指定
npm run print -- character.txt -o output.pdf

# ローカルのPNG/JPEGを立ち絵欄へ配置
npm run print -- character.txt --portrait portrait.png

# フォームを削除した印刷向けPDFを生成
npm run print -- character.txt --flatten

# 標準入力から読み込む
cat character.txt | npm run print -- - -o output.pdf
```

TXT内のアイコンURLは情報として付録へ残しますが、自動ダウンロードは行いません。

## PDFマスタの再生成

```sh
npm run build:template
```

生成物は `build/normalized-template.pdf` です。`build/` はGit管理対象外で、削除しても同じコマンドで再生成できます。通常の `npm run print` は同じ処理を内部で毎回実行するため、古いマスタを使用しません。

すべてのフォームへ日本語と確認値を入れ、PNGへレンダリングするには次を実行します。

```sh
npm run verify:template
```

確認用PDFと画像は `build/template-verification*` に生成されます。

## 座標調整

フォーム構造は [`config/template-layout.json`](config/template-layout.json) で定義しています。原本フォームの矩形を基準にしますが、個別に位置を補正する場合は `rectOverrides` へ次の形式で追加します。

```json
{
  "rectOverrides": {
    "profile.name": [74.835, 667.275, 83.15, 13.229]
  }
}
```

値はPDF座標の `[x, y, width, height]` です。変更後は `npm run verify:template` で全項目の配置を確認してください。

## 出力内容

- 基本情報、能力値、HP・MP・SAN、DB・ビルド・MOV
- レギュラー／ハード／イクストリーム技能値
- 固定技能と自由技能
- 武器5件、装備20件、収入・財産
- 標準バックストーリー
- 任意のローカル立ち絵
- メモ、通過シナリオ、フォームへ収まらない情報を付録ページへ自動出力

フォームへ収まらない情報は黙って切り捨てず、警告を表示して付録へ移します。

## テスト

```sh
npm test
```

テストでは匿名化したいあきゃらv2.0.1 fixtureを使用します。実キャラクターデータはリポジトリへ保存しません。

## 対象外

- いあきゃら公開URLのスクレイピング
- ココフォリア用JSON／チャットパレットの直接入力
- アイコンURLの自動取得
- いあきゃら6版またはテキスト出力v2系以外
