# タスク: R2サービスの typed client 実装とルーティング整備

## 背景・目的

このリポジトリ (`internal-gateway`) は Cloudflare Workers 製の API ゲートウェイ。
現状、R2サービスへのプロキシは `src/upstreams/r2.ts` の `proxyToR2` で生（型なし）に行っている。

**やること：**
1. `cloudflare-r2-service` の OpenAPI スペックから TypeScript 型を生成する仕組みを作る
2. `openapi-fetch` を使った typed client に置き換える
3. R2 の各 RPC メソッドに対する明示的なルート定義を `routes.ts` に追加する
4. 型の自動更新 CI を追加する

---

## ステップ 1: パッケージのインストール

```bash
npm install openapi-fetch
npm install --save-dev openapi-typescript
```

---

## ステップ 2: 型生成スクリプトの追加

`package.json` の `scripts` に追加：

```json
"generate:r2-types": "openapi-typescript https://raw.githubusercontent.com/tachiiri-org/cloudflare-r2-service/main/openapi.json -o src/types/r2-api.d.ts"
```

その後、型を生成する：

```bash
npm run generate:r2-types
```

生成された `src/types/r2-api.d.ts` を読んで、利用可能な RPC メソッド（パス）をすべて把握してから次のステップに進む。

---

## ステップ 3: typed R2 client の実装

`src/upstreams/r2.ts` を **全面的に書き換える**（`proxyToR2` は削除）。

### クライアントのアーキテクチャ

- `openapi-fetch` の `createClient<paths>` を使う
- Cloudflare サービスバインディング (`env.R2_SERVICE: Fetcher`) をトランスポートとして使用
- base URL は `http://r2-service`（サービスバインディングでは URL は実際にはルーティングに使われないため任意）

```typescript
import createClient from 'openapi-fetch';
import type { paths } from '../types/r2-api';
import type { Actor, Env, RouteDef } from '../types';
import { actorToHeaders } from '../policies/auth/actor';

export function makeR2Client(params: {
  env: Env;
  actor: Actor | null;
  requestId: string;
  routeDef: RouteDef;
}) {
  const { env, actor, requestId, routeDef } = params;

  const client = createClient<paths>({
    baseUrl: 'http://r2-service',
    fetch: (req) => env.R2_SERVICE.fetch(req as Request),
  });

  // 共通ヘッダーをミドルウェアで注入
  client.use({
    onRequest({ request }) {
      request.headers.set('x-gateway-token', env.GATEWAY_TO_BACKEND_TOKEN);
      request.headers.set('x-request-id', requestId);
      request.headers.set('x-route-id', routeDef.id);
      if (actor) {
        const actorHeaders = actorToHeaders(actor);
        for (const [key, value] of Object.entries(actorHeaders)) {
          request.headers.set(key, value);
        }
      }
      return request;
    },
  });

  return client;
}
```

### レスポンスの処理

各 RPC ハンドラでは以下のパターンを使う：

```typescript
const { data, error, response } = await r2.POST('/rpc/r2_xxx', { body });
if (error || !response.ok) {
  throw new GatewayError({
    status: response.status,
    code: 'upstream_error',
    message: 'Upstream request failed',
    details: error,
  });
}
const responseHeaders = new Headers(response.headers);
responseHeaders.set('x-request-id', requestId);
return new Response(JSON.stringify(data), {
  status: response.status,
  headers: responseHeaders,
});
```

---

## ステップ 4: ルーティングの整備

`src/routes/v1/routes.ts` を更新する。

### やること

1. `routes` 配列に R2 の各 RPC メソッドを **明示的に** 追加する
   - ステップ 2 で生成した型から、存在するすべての `/rpc/r2_*` パスを確認して列挙する
   - 各ルートの `class` は操作の性質に応じて `"read"` または `"write"` を設定する

2. `handleV1Request` の R2 ディスパッチ部分（`rpcMethod.startsWith("r2_")` のブロック）を
   typed client を使った実装に置き換える

### ルート定義の例

```typescript
{
  id: "r2-file-get",
  method: "POST",
  path: "/api/v1/r2_file_get",
  upstreamPath: "/rpc/r2_file_get",
  auth: "required",
  class: "read",
},
{
  id: "r2-file-save",
  method: "POST",
  path: "/api/v1/r2_file_save",
  upstreamPath: "/rpc/r2_file_save",
  auth: "required",
  class: "write",
},
// ... 残りのR2メソッド
```

### ハンドラのディスパッチ

`rpcMethod.startsWith("r2_")` のブロックを、メソッド名で switch するか、
typed client の呼び出しに置き換える。リクエストボディは `await request.json()` でパースして渡す。

---

## ステップ 5: CI による型の自動更新

`.github/workflows/update-r2-types.yml` を新規作成：

```yaml
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
        shell: bash
```

---

## 守るべき規約・制約

### コードスタイル
- 既存コードに合わせる（`src/upstreams/github.ts` や `src/upstreams/googleDrive.ts` を参考に）
- TypeScript strict モード。型アサーション (`as`) は最小限に
- ESM (`import`/`export`)、`async/await`
- エラーは必ず `GatewayError`（`src/errors/gatewayError.ts`）でスロー

### ヘッダー規約
- クライアントへのヘッダーは `sanitizeActorHeaders` → `actorToHeaders` → gateway token の順（`src/upstreams/r2.ts` の既存実装参照）
- `x-internal-token` はバックエンドに転送しない
- `authorization` ヘッダーはバックエンドに転送しない（R2 はサービスバインディングで認証済み）

### 仕様への準拠
- 実装上の判断（Actor モデル、認証、エラー形式など）は `@tachiiri-library/specifications` のスペックを参照する
  - インストール済み: `devDependencies` に `@tachiiri-library/specifications` あり
  - パス: `node_modules/@tachiiri-library/specifications/specs/`
  - 特に参照すべきファイル:
    - `specs/00_constitution/actor_subject_tenant_model.md`
    - `specs/00_constitution/authorization.md`
    - `specs/30_interaction_edges/http.md`

---

## 既存ファイルの参照先

| ファイル | 役割 |
|---|---|
| `src/upstreams/r2.ts` | 置き換え対象（現在の生プロキシ実装） |
| `src/upstreams/github.ts` | 実装パターンの参考 |
| `src/routes/v1/routes.ts` | ルート定義とディスパッチロジック |
| `src/types.ts` | `Actor`, `Env`, `RouteDef` 型定義 |
| `src/policies/auth/actor.ts` | `actorToHeaders()` 関数 |
| `src/policies/internal/sanitizeActorHeaders.ts` | Actor ヘッダーのサニタイズ |
| `src/errors/gatewayError.ts` | エラークラス |
| `docs/api-client-guide.md` | このタスクの背景ガイド（外部向けドキュメント） |

---

## 完了の確認

- `npm run typecheck` がエラーなし
- `npm run lint` がエラーなし
- `npm run build` がエラーなし
- R2 の全 RPC メソッドに対して明示的なルートが定義されている
- `proxyToR2` 関数が削除されている
- `src/types/r2-api.d.ts` が生成されている
- `.github/workflows/update-r2-types.yml` が追加されている
