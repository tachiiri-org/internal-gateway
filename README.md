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
