# internal-gateway

Cloudflare Worker gateway for tachiiri services.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev       # Start local dev server
npm run typecheck # Type check
npm run lint      # Lint
npm run test      # Run tests
npm run deploy    # Deploy to Cloudflare
```

## 本番環境チェック

`wrangler dev --remote` で本番環境とゲートウェイでつないでテスト可能。
GithubのmainブランチへのプッシュでCloudflare workersにデプロイされるので、その後これを実施するか、ユーザーに案内すればテストができる。

## OpenAPI スペックの利用

他プロジェクトから `openapi.json` を参照する場合は、GitHub 経由で npm install できる。

```json
// package.json
{
  "dependencies": {
    "internal-gateway": "github:tachiiri/internal-gateway#main"
  }
}
```

```bash
npm install
```

インストール後、以下のように参照可能:

```ts
// ESM import (TypeScript)
import spec from 'internal-gateway/openapi.json' assert { type: 'json' }
```

```ts
// ファイルパスで直接参照
import { readFileSync } from 'fs'
const spec = JSON.parse(readFileSync('node_modules/internal-gateway/openapi.json', 'utf-8'))
```

> **Note**: `openapi.json` は `npm run generate:openapi` で生成される。バックエンドの OpenAPI spec を取得してパスを `/api/v1/*` に変換したものが出力される。

## Specifications

実装上の判断基準として [`@tachiiri-library/specifications`](https://www.npmjs.com/package/@tachiiri-library/specifications) を参照する。
`npm install` で自動的にインストールされる（`devDependencies` に記載済み）。

```
node_modules/@tachiiri-library/specifications/specs/
├── 00_constitution/           # 語彙・責任境界・不変条件・禁止事項 (L0)
├── 20_operational_semantics/  # 運用セマンティクス・安全性・互換性
├── 30_interaction_edges/      # HTTP・セッション・Webhookなど外部接点
└── 40_service_operations_governance/  # 変更・リリース・インシデント・セキュリティ運用
```

主要エントリポイント:

- `specs/00_constitution/actor_subject_tenant_model.md`
- `specs/00_constitution/authorization.md`
- `specs/00_constitution/identity.md`
- `specs/30_interaction_edges/http.md`
