# PokéPack Opener

Pokémon TCG APIを使用してランダムにポケモンカードを取得し、コレクションとして保存できるWebアプリケーションです。

🌐 **公開URL**: https://shigetomoyamamoto.github.io/PokePackOpener/

## 機能

- **パック開封機能**: ボタンをクリックすると、ランダムに5枚のポケモンカードを取得
- **カード表示**: カード画像、名前、タイプなどの基本情報を表示
- **コレクション管理**: 引いたカードをローカルストレージに自動保存
- **コレクション閲覧**: これまでに引いたカードを一覧で確認可能
- **エクスポート/インポート**: コレクションをJSONファイルとして保存・読み込み可能

## 技術スタック

- **フロントエンド**: React 18
- **ビルドツール**: Vite
- **ルーティング**: React Router (HashRouter)
- **API**: [Pokémon TCG API](https://docs.pokemontcg.io/)
- **ホスティング**: GitHub Pages

## セットアップ

### 必要な環境

- Node.js 18以上
- npm

### インストール

```bash
npm install
```

### 環境変数の設定（オプション）

Pokémon TCG API v2では、無料プランでもAPIキーが必要な場合があります。
APIキーを設定する場合は、プロジェクトルートに `.env` ファイルを作成してください：

```bash
cp .env.example .env
# .envファイルを編集してAPIキーを設定
```

`.env` ファイルの例：

```
VITE_POKEMON_TCG_API_KEY=your_api_key_here
```

APIキーは [Pokémon TCG API](https://pokemontcg.io/) でアカウントを作成して取得できます。
APIキーが設定されていない場合でも、APIキーなしで動作を試みますが、レート制限やCORSの問題が発生する可能性があります。

### GitHub Pagesデプロイ時のAPIキー設定

GitHub Pagesでデプロイする場合、GitHub Secretsを使用してAPIキーを設定してください：

1. GitHubリポジトリの「Settings」→「Secrets and variables」→「Actions」に移動
2. 「New repository secret」をクリック
3. Name: `VITE_POKEMON_TCG_API_KEY`、Value: あなたのAPIキー を設定
4. 「Add secret」をクリック

これにより、GitHub Actionsのビルド時にAPIキーが環境変数として設定され、公開ページでもAPIが正常に動作します。

### 開発サーバーの起動

```bash
npm run dev
```

ブラウザで `http://localhost:5173` を開いてください。

### ビルド

```bash
npm run build
```

ビルド成果物は `dist` フォルダに生成されます。

### プレビュー

```bash
npm run preview
```

## デプロイ

GitHub Actionsを使用して自動デプロイが設定されています。

1. `develop` または `main` ブランチにプッシュすると自動的にビルドが実行されます
2. ビルド成果物が `gh-pages` ブランチにデプロイされます

手動でデプロイする場合:

```bash
npm run build
# distフォルダの内容をgh-pagesブランチにプッシュ
```

## プロジェクト構造

```
pokepack-opener/
├── src/
│   ├── components/      # 再利用可能なコンポーネント
│   │   ├── Card.jsx     # カード表示コンポーネント
│   │   └── CardGrid.jsx # カードグリッド表示
│   ├── pages/           # ページコンポーネント
│   │   ├── HomePage.jsx      # ホームページ（パック開封）
│   │   └── CollectionPage.jsx # コレクション画面
│   ├── utils/           # ユーティリティ関数
│   │   ├── api.js       # Pokémon TCG API クライアント
│   │   └── storage.js   # ローカルストレージ管理
│   ├── App.jsx          # メインアプリケーション
│   └── main.jsx         # エントリーポイント
├── .github/
│   └── workflows/
│       └── deploy.yml    # GitHub Actions デプロイ設定
├── 404.html             # GitHub Pages用404ページ
└── vite.config.js       # Vite設定
```

## ライセンス

MIT
