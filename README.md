<div align="center">

# CloudDocs AI

**Intelligent document management for the cloud era.**

Upload PDFs and DOCX files. CloudDocs AI extracts text, summarises and classifies
documents with OpenAI, indexes them with hybrid full-text + semantic search and
lets you chat with your own knowledge base — all on a serverless AWS stack that
costs cents per month at idle.

[Architecture](#architecture) · [Tech stack](#tech-stack) · [Local dev](#local-development) · [Roadmap](#roadmap)

</div>

---

> **Status — Phase 5 complete; Phase 6 (production deploy) in progress.**
> The full MVP is live on AWS (`sa-east-1`): JWT auth + multi-tenant orgs,
> document upload to S3 via presigned URLs, an async AI pipeline (extract →
> summarize → classify with `gpt-4o-mini`), full-text search and a metrics
> dashboard. The Angular SPA covers auth, upload, document detail with live AI
> results, search/filters and the dashboard. Phase 6 wires the frontend to
> Vercel for a public demo URL.

<!-- Live demo: set once the Vercel deploy is connected, e.g. https://clouddocs.vercel.app -->

**Live demo:** _coming soon (Vercel)._ · **API:** `https://ngm5oizp91.execute-api.sa-east-1.amazonaws.com/v1/health`

## Why this exists

CloudDocs AI is a portfolio-grade reference implementation. It exists to show that
a single engineer can stand up a credible SaaS product end-to-end — multi-tenant
data model, real AI integration, IaC, observability and CI/CD — using only free
tiers of AWS, Neon and Vercel. The full technical plan lives in
[`docs/plan.md`](docs/plan.md).

## Architecture

```
Browser (Angular 21 SPA)
    │   HTTPS, JWT in header, refresh in httpOnly cookie
    ▼
Vercel (edge / CDN)
    │
    ▼
AWS API Gateway (HTTP API v2) — JWT authorizer
    │
    ├──► auth-service       (login, register, refresh)
    ├──► documents-service  (CRUD, presigned URLs)
    ├──► ai-orchestrator    (analysis triggers, results)
    ├──► search-service     (full-text + semantic)
    ├──► orgs-service       (org / member / invitation)
    └──► billing-service    (Stripe — Phase 5)
                                  │
                                  ▼
                Postgres (Neon) + pgvector · S3 · OpenAI

Async pipeline:
    S3 ──► EventBridge ──► SQS ──► extract → summarize → classify → embed
```

## Tech stack

| Layer    | Choice                                                   | Why                                          |
| -------- | -------------------------------------------------------- | -------------------------------------------- |
| Frontend | Angular 21 (standalone, zoneless, Signals) + Tailwind v4 | Modern, type-safe, premium DX                |
| Monorepo | Nx + pnpm workspaces                                     | Affected commands, dependency graph, fast CI |
| Backend  | AWS Lambda (Node 22 ARM64) + API Gateway v2              | Pay-per-use, free tier covers demo traffic   |
| Database | Neon Postgres + pgvector                                 | Single store for relational + vector data    |
| Storage  | AWS S3 (presigned PUT/GET)                               | Standard, free tier, direct browser uploads  |
| AI       | OpenAI `gpt-4o-mini` + `text-embedding-3-small`          | Cheap, fast, good enough quality             |
| Auth     | JWT (jose) + argon2 + httpOnly refresh cookies           | Demonstrates ownership of auth flow          |
| IaC      | AWS CDK (TypeScript)                                     | Type-safe, same language as backend          |
| Deploy   | Vercel (frontend) · AWS CDK (backend) · Neon (DB)        | Free tier across the board                   |

## Repository layout

```
.
├── apps/
│   ├── web/              Angular 21 SPA (Tailwind v4, dark-first)
│   └── api/              Node Lambda handlers (esbuild bundled)
├── libs/
│   ├── shared-types/     zod DTOs shared between FE and BE
│   ├── shared-utils/     pure helpers
│   └── ui-tokens/        design tokens (synced with styles.css)
├── infra/                AWS CDK stacks (added in Phase 1)
├── docs/                 architecture, ADRs, runbooks
└── .github/workflows/    CI + deploy pipelines
```

## Local development

Requires **Node 22.13+** (see `.nvmrc`), **pnpm 11+**, and **Docker** (for the
local Postgres).

```bash
# One-time
nvm use                 # pick up .nvmrc
corepack enable
pnpm install
cp .env.example .env.local

# Bring up Postgres + pgvector on localhost:5434
# (5432/5433 are commonly taken; override with COMPOSE_POSTGRES_PORT=<port>)
docker compose up -d

# Frontend (Angular dev server, http://localhost:4200)
pnpm nx serve web

# Backend (runs the bundled handlers locally)
pnpm nx serve api

# Quality gates
pnpm lint               # all projects
pnpm test               # vitest + Angular tests
pnpm build              # builds every app + lib
pnpm typecheck          # tsc --noEmit across the workspace

# Dependency graph
pnpm graph
```

Commits are linted by **commitlint** (Conventional Commits) and **lint-staged**
runs Prettier + ESLint on staged files via Husky pre-commit hooks.

## Roadmap

The work is sequenced into publishable phases. Each phase produces something
demoable so the project never sits half-finished.

| Phase | Theme                                          | Status         |
| ----- | ---------------------------------------------- | -------------- |
| 0     | Workspace, tooling, libs, healthcheck handler  | ✅ Done        |
| 1     | CDK stacks (S3, API GW, observability)         | ✅ Done        |
| 2     | Auth + multi-tenant orgs (API + frontend UI)   | ✅ Done        |
| 3     | Upload + S3 storage                            | ✅ Done        |
| 4     | AI pipeline (extract → summarize → classify)   | ✅ Done        |
| 5     | Dashboard + full-text search                   | ✅ Done        |
| 6     | Polish + production deploy (frontend → Vercel) | 🟡 In progress |
| 7+    | Embeddings + RAG chat + folders + Stripe + OCR | ⏳             |

See [`docs/plan.md`](docs/plan.md) for the detailed architecture, data model,
security model and AWS free-tier strategy.

## Deployment

- **Backend (AWS CDK → sa-east-1):** `cd infra && AWS_PROFILE=clouddocs-dev AWS_REGION=sa-east-1 ALERT_EMAIL=… pnpm exec cdk deploy --all`. App stacks live in `sa-east-1`; the billing/observability stack is pinned to `us-east-1`.
- **Frontend (Vercel):** connect the GitHub repo in Vercel — `vercel.json` sets the build (`nx build web --configuration=production`), output (`dist/apps/web/browser`) and SPA rewrites. After the first deploy, allow the resulting origin on the API by redeploying with `WEB_ORIGIN=https://<project>.vercel.app` (the CORS allowlist reads it; credentials require an exact origin).
- **Secrets:** `clouddocs/dev/api` in Secrets Manager holds `DATABASE_URL`, the JWT keys and `OPENAI_API_KEY`; populate with `pnpm secrets:put:dev` from `.env.local`.

## License

MIT.
