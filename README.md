<div align="center">

# CloudDocs AI

**Intelligent document management for the cloud era.**

Upload PDFs and DOCX files. CloudDocs AI extracts text, summarises and classifies
documents with OpenAI, indexes them with hybrid full-text + semantic search, lets
you chat with your own knowledge base, organise docs into folders, share them
publicly, collaborate with comments — all on a serverless AWS stack that costs
cents per month at idle.

[Features](#features) · [Architecture](#architecture) · [Tech stack](#tech-stack) · [Local dev](#local-development) · [Deployment](#deployment) · [Roadmap](#roadmap)

</div>

---

> **Status — all 11 phases complete and live.**
> The full product is deployed: the Angular SPA on Vercel talks to a serverless API
> on AWS (`sa-east-1`) backed by Neon Postgres + pgvector. Auth, document
> processing, AI pipeline, semantic search, RAG chat, folders, public share links,
> comments, Stripe billing, OCR for scanned PDFs, in-app notifications and an
> activity audit log are all running in production.

**Live demo:** https://cloud-docs-theta.vercel.app · **API health:** `https://ngm5oizp91.execute-api.sa-east-1.amazonaws.com/v1/health`

## Features

| Category          | Feature                                                                              |
| ----------------- | ------------------------------------------------------------------------------------ |
| **Documents**     | Upload PDF / DOCX (presigned S3 PUT, browser-direct)                                 |
|                   | Async AI pipeline: extract text → summarise → classify with `gpt-4o-mini`            |
|                   | OCR for scanned PDFs via Tesseract.js (auto-detected, async worker)                  |
|                   | Full-text search (`tsvector`) + semantic search (pgvector hybrid RRF)                |
|                   | RAG chat — ask questions across the whole library or per document, with citations    |
|                   | Folder tree with nested folders; documents placed in folders at upload time          |
|                   | Public share links (token-based, optional expiry, unauthenticated download)          |
|                   | Comments per document, threaded replies, delete own comments                         |
| **Organisation**  | Multi-tenant from day one — every query scoped to `org_id` via `OrgScopedRepository` |
|                   | JWT auth + argon2id passwords + httpOnly refresh cookies + CSRF header               |
|                   | Dashboard with KPIs, per-day upload sparkline, recent documents                      |
| **Billing**       | Free / Pro plans enforced at the API layer (429 on quota exceeded)                   |
|                   | Stripe Checkout + Customer Portal; webhook upgrades / downgrades the org plan        |
|                   | Usage meters (docs, AI analyses, storage) with monthly counters                      |
| **Observability** | In-app notifications — bell icon with unread badge, mark-read / mark-all-read        |
|                   | Activity audit log (`GET /v1/activity`) with action / date filters and CSV export    |
|                   | AWS billing alarm + SNS alerts; CloudWatch log retention                             |

## Architecture

```
Browser (Angular 21 SPA)
    │   HTTPS  ·  JWT in header  ·  refresh in httpOnly cookie
    ▼
Vercel (CDN / edge)
    │
    ▼
AWS API Gateway (HTTP API v2) — sa-east-1
    │
    ├── auth          register · login · refresh · logout · me
    ├── documents     CRUD · presigned S3 PUT/GET · stats
    ├── folders       nested tree CRUD
    ├── shares        create · revoke · public GET (no JWT)
    ├── comments      per-document threaded comments
    ├── chat          POST /v1/chat → RAG (embed + retrieve + gpt-4o-mini)
    ├── billing       checkout · portal · usage · webhook (Stripe)
    ├── notifications list · mark-read · mark-all-read
    └── activity      audit log with CSV export
              │
              ▼
     Neon Postgres (pgvector) · AWS S3 · OpenAI · Stripe

Async AI + OCR pipeline:
    S3 ObjectCreated
        └──► EventBridge ──► SQS (doc-ingest)
                 └──► extract-worker
                          ├── text found  ──► DocumentExtracted ──► SQS fan-out
                          │                       ├── summarize-worker (gpt-4o-mini)
                          │                       ├── classify-worker  (gpt-4o-mini)
                          │                       └── embed-worker     (text-embedding-3-small)
                          └── text empty  ──► DocumentNeedsOcr ──► SQS (doc-ocr)
                                                  └── ocr-worker (Tesseract.js)
                                                           └──► DocumentExtracted (same fan-out)
```

## Tech stack

| Layer    | Choice                                                   | Why                                          |
| -------- | -------------------------------------------------------- | -------------------------------------------- |
| Frontend | Angular 21 (standalone, zoneless, Signals) + Tailwind v4 | Modern, type-safe, premium DX                |
| Monorepo | Nx 22 + pnpm 11 workspaces                               | Affected commands, dependency graph, fast CI |
| Backend  | AWS Lambda (Node 22 ARM64) + API Gateway v2              | Pay-per-use, free tier covers demo traffic   |
| Database | Neon Postgres + pgvector                                 | Single store for relational + vector data    |
| Storage  | AWS S3 (presigned PUT/GET)                               | Standard, free tier, direct browser uploads  |
| AI       | OpenAI `gpt-4o-mini` + `text-embedding-3-small`          | Cheap, fast, good enough quality             |
| OCR      | Tesseract.js (WASM, runs in Lambda)                      | Free, no per-page cost, caches lang data     |
| Auth     | JWT (jose) + argon2id + httpOnly refresh cookies         | Demonstrates ownership of auth flow          |
| Billing  | Stripe Checkout + Customer Portal + webhooks             | Industry standard, test mode is free         |
| IaC      | AWS CDK (TypeScript)                                     | Type-safe, same language as backend          |
| Deploy   | Vercel (frontend) · AWS CDK (backend) · Neon (DB)        | Free tier across the board                   |

## Repository layout

```
.
├── apps/
│   ├── web/              Angular 21 SPA (Tailwind v4, dark-first)
│   └── api/              Node Lambda handlers (esbuild bundled)
│       └── src/handlers/
│           ├── auth/         register · login · refresh · logout · me
│           ├── documents/    CRUD + presigned URLs + comments
│           ├── folders/      nested folder CRUD
│           ├── shares/       share links + public unauthenticated GET
│           ├── chat/         RAG endpoint
│           ├── billing/      Stripe checkout · portal · usage · webhook
│           ├── notifications/ list · read · read-all
│           ├── activity/     audit log + CSV export
│           └── workers/      extract · summarize · classify · embed · ocr
├── libs/
│   ├── shared-types/     zod DTOs shared between FE and BE
│   └── shared-utils/     pure helpers
├── infra/                AWS CDK stacks (api · storage · pipeline · observability)
├── docs/                 architecture, ADRs, full plan
└── tools/
    └── migrations/       node-pg-migrate SQL files (one per phase)
```

## Local development

Requires **Node 22.13+** (see `.nvmrc`), **pnpm 11+**, and **Docker** (for the local Postgres).

```bash
# One-time setup
nvm use
corepack enable
pnpm install
cp .env.example .env.local   # fill in DATABASE_URL, JWT keys, OPENAI_API_KEY

# Postgres + pgvector on localhost:5434
docker compose up -d
pnpm db:migrate:up           # run all migrations

# Frontend (Angular dev server → http://localhost:4200)
pnpm nx serve web

# Quality gates
pnpm lint       # ESLint across all projects
pnpm test       # vitest unit tests
pnpm build      # esbuild (api) + Angular builder (web)

# Integration tests (requires Docker DB)
pnpm test:integration        # 79 tests against real Postgres
```

Commits are linted by **commitlint** (Conventional Commits) and **lint-staged**
runs Prettier + ESLint on staged files via Husky pre-commit hooks.

## Deployment

### AWS (backend + pipeline)

```bash
cd infra && \
  AWS_PROFILE=<profile> \
  AWS_REGION=sa-east-1 \
  AWS_DEFAULT_REGION=sa-east-1 \
  ALERT_EMAIL=<email> \
  WEB_ORIGIN=https://<your-vercel-app>.vercel.app \
  pnpm exec cdk deploy clouddocs-dev-api clouddocs-dev-pipeline \
  --require-approval never --context stage=dev
```

The observability stack (`clouddocs-dev-observability`) is pinned to `us-east-1`
because AWS only publishes `EstimatedCharges` metrics there.

### Secrets

`clouddocs/<stage>/api` in Secrets Manager holds all runtime secrets. Populate from `.env.local`:

```bash
AWS_PROFILE=<profile> pnpm secrets:put:dev
```

Required keys:

| Key                     | Description                      |
| ----------------------- | -------------------------------- |
| `DATABASE_URL`          | Neon connection string           |
| `JWT_PRIVATE_KEY`       | Ed25519 private key (PEM)        |
| `JWT_PUBLIC_KEY`        | Ed25519 public key (PEM)         |
| `OPENAI_API_KEY`        | For AI pipeline + embeddings     |
| `STRIPE_SECRET_KEY`     | `sk_test_…` or `sk_live_…`       |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from Stripe dashboard  |
| `STRIPE_PRICE_ID`       | Price ID of the Pro plan product |

Generate JWT keys: `pnpm nx run api:generate-keys` (see `tools/scripts/generate-jwt-keys.ts`).

### Frontend (Vercel)

Connect the GitHub repo in Vercel — `vercel.json` sets the build command
(`nx build web --configuration=production`), output directory
(`dist/apps/web/browser`) and SPA rewrites. After the first deploy, redeploy
the API stack with `WEB_ORIGIN=https://<project>.vercel.app` so the CORS
allowlist includes the live origin.

### Stripe webhook

Register `https://<api-endpoint>/v1/billing/webhook` in your Stripe dashboard
with the following events:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## Roadmap

| Phase | Theme                                          | Status  |
| ----- | ---------------------------------------------- | ------- |
| 0     | Workspace, tooling, libs, healthcheck handler  | ✅ Done |
| 1     | CDK stacks (S3, API GW, observability)         | ✅ Done |
| 2     | Auth + multi-tenant orgs (API + frontend UI)   | ✅ Done |
| 3     | Upload + S3 storage                            | ✅ Done |
| 4     | AI pipeline (extract → summarize → classify)   | ✅ Done |
| 5     | Dashboard + full-text search                   | ✅ Done |
| 6     | Polish + production deploy (frontend → Vercel) | ✅ Done |
| 7     | Embeddings + hybrid semantic search (pgvector) | ✅ Done |
| 8     | RAG chat with citations                        | ✅ Done |
| 9     | Folders + public share links + comments        | ✅ Done |
| 10    | Stripe billing (Free / Pro plans)              | ✅ Done |
| 11    | OCR + in-app notifications + audit UI          | ✅ Done |

See [`docs/plan.md`](docs/plan.md) for the detailed architecture, data model,
security model and AWS free-tier cost strategy.

## License

MIT.
