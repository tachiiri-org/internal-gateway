# API クライアント利用ガイド（外部リポジトリ向け）

このサービスの OpenAPI スペックを使って、別リポジトリから型安全なクライアントを生成する方法をまとめます。

## OpenAPI スペックについて

`main` ブランチへのプッシュ時に CI が自動的に `openapi.json` を生成・コミットします。
以下の URL から常に最新版を参照できます。

```
https://raw.githubusercontent.com/<org>/cloudflare-r2-service/main/openapi.json
```

ローカルで手動生成する場合：

```bash
npm run generate:openapi
```

---

## ゲートウェイ側のセットアップ

### 1. 依存パッケージのインストール

```bash
npm install openapi-fetch
npm install -D openapi-typescript
```

### 2. 型生成スクリプトの追加

```json
// package.json
{
  "scripts": {
    "generate:r2-types": "openapi-typescript https://raw.githubusercontent.com/<org>/cloudflare-r2-service/main/openapi.json -o src/types/r2-api.d.ts"
  }
}
```

```bash
npm run generate:r2-types
```

### 3. クライアントの初期化

```ts
// src/lib/r2-client.ts
import createClient from 'openapi-fetch';
import type { paths } from '../types/r2-api.d.ts';

export const r2 = createClient<paths>({
  baseUrl: process.env.R2_SERVICE_URL,  // e.g. https://cloudflare-r2-service.your-org.workers.dev
  headers: {
    'X-Gateway-Token': process.env.GATEWAY_TO_BACKEND_TOKEN,
    'X-Actor-Sub': '...',       // 認証済みユーザーの情報を付与
    'X-Actor-Email': '...',
    'X-Actor-Role': '...',
  },
});
```

### 4. 呼び出し例

```ts
// ファイル取得（メタデータ + コンテンツ）
const { data, error } = await r2.POST('/rpc/r2_file_get', {
  body: { bucket_id: 'my-bucket', key: 'path/to/file.txt' },
});
if (error) throw new Error(error.message);

const content = atob(data.content_base64);  // base64 デコード

// ファイル保存（ETag による楽観的ロック）
await r2.POST('/rpc/r2_file_save', {
  body: {
    bucket_id: 'my-bucket',
    key: 'path/to/file.txt',
    content: btoa('hello world'),  // base64 エンコード
    if_match: data.etag,           // 競合検出
  },
});

// バケット一覧
const { data: buckets } = await r2.POST('/rpc/r2_bucket_list', {
  body: {},
});

// 署名付きURL（ダウンロードリンク生成）
const { data: ref } = await r2.POST('/rpc/r2_reference_resolve', {
  body: { bucket_id: 'my-bucket', key: 'path/to/file.txt', expires_in: 3600 },
});
const downloadUrl = ref.url;
```

---

## 型の自動更新（CI）

スキーマ変更を定期的に取り込むため、ゲートウェイ側の CI に以下を追加することを推奨します。

```yaml
# .github/workflows/update-r2-types.yml
name: Update R2 API Types

on:
  schedule:
    - cron: '0 9 * * 1'  # 毎週月曜 9:00 UTC
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run generate:r2-types
      - name: Commit if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add src/types/r2-api.d.ts
          if git diff --staged --quiet; then
            echo "No changes"
          else
            git commit -m "chore: update r2 api types"
            git push
          fi
```

---

## リクエストヘッダー

すべてのリクエストに以下のヘッダーが必要です。

| ヘッダー | 必須 | 説明 |
|---|---|---|
| `X-Gateway-Token` | 必須 | サービス間認証トークン（`GATEWAY_TO_BACKEND_TOKEN` 環境変数の値） |
| `X-Actor-Sub` | 必須 | 認証済みユーザーの ID |
| `X-Actor-Email` | 任意 | ユーザーのメールアドレス |
| `X-Actor-Name` | 任意 | ユーザーの表示名 |
| `X-Actor-Role` | 任意 | ユーザーのロール |
| `X-Actor-Org-Id` | 任意 | 組織 ID |

---

## エラーレスポンス

すべてのエラーは以下の形式で返ります。

```ts
type ErrorResponse = {
  error_code: string;   // 例: 'RPC_NOT_FOUND', 'RPC_CONFLICT'
  message: string;
  request_id: string;   // デバッグ用、ログと突合可能
  details?: unknown;
};
```

主なエラーコード：

| HTTP | error_code | 意味 |
|---|---|---|
| 400 | `RPC_INVALID_ARGUMENT` | リクエストパラメータ不正 |
| 403 | `RPC_PERMISSION_DENIED` | Gateway Token 不正 |
| 404 | `RPC_NOT_FOUND` | リソースが存在しない |
| 409 | `RPC_CONFLICT` | ETag 不一致（楽観的ロック失敗） |
| 429 | `RPC_TOO_MANY_REQUESTS` | レート制限 |
| 503 | `RPC_SERVICE_UNAVAILABLE` | R2 側タイムアウト・過負荷 |
