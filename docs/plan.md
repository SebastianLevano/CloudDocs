# CloudDocs AI — Plan Técnico Enterprise

> **Status:** Plan técnico v1.0 — listo para ejecución por fases
> **Autor:** Arquitectura senior (sesión Claude Code, 2026-05-20)
> **Owner:** Sebastián

---

## 1. Context

**Problema / Necesidad.** Se quiere construir un proyecto portfolio que demuestre capacidades reales de un ingeniero full-stack senior orientado a cloud: arquitectura serverless, Angular enterprise, integración IA productiva y prácticas SaaS reales (multi-tenancy, billing, observabilidad). El objetivo no es un CRUD más, sino un sistema que un recruiter o tech lead pueda revisar y concluir _"esta persona puede liderar arquitectura cloud moderna"_.

**Producto.** _CloudDocs AI_ — una plataforma SaaS de gestión documental inteligente. Los usuarios suben PDF/DOCX, el sistema extrae texto, los resume y clasifica con IA, los indexa para búsqueda semántica y permite chatear con los documentos. Estilo visual referencia: Linear / Vercel / Stripe Dashboard.

**Resultado esperado.**

- Aplicación productiva y desplegada (frontend en Vercel, backend serverless en AWS, DB en Neon).
- Repositorio público pulido, con README ejecutivo, diagrama de arquitectura, demo en vivo y video.
- Coste operativo cercano a $0 en estado idle, gracias a free tiers y arquitectura on-demand.
- Demuestra: Angular 20 (Signals + standalone), AWS Lambda + API Gateway + S3, IaC con CDK, multi-tenancy real, IA aplicada (OpenAI + embeddings + pgvector), observabilidad y CI/CD.

**Decisiones pre-confirmadas por el usuario.**

- Monorepo: **Nx** (workspace TypeScript).
- IaC: **AWS CDK (TypeScript)**.
- Modelo de tenencia: **Multi-tenant con Organizations** desde día 1.
- Billing: **Stripe** integrado en Fase 5/6 (Free + Pro plan).

**Decisiones tomadas por el arquitecto (justificadas en §4).**

- Región AWS: `us-east-1` (mejor free tier, latencia razonable LATAM/EU, integración nativa con todos los servicios).
- Runtime Lambda: **Node.js 22.x ARM64** (Graviton — 20 % más barato y mejor cold start).
- Parser PDF: `pdf-parse` para MVP, fallback a `pdfjs-dist` para PDFs complejos; OCR con `tesseract.js` o AWS Textract diferido a Fase 2.
- Parser DOCX: `mammoth`.
- Modelos OpenAI: `gpt-4o-mini` para resúmenes/clasificación (coste ~$0.15/1M input), `text-embedding-3-small` para vectores (1536 dims).
- Vector store: **pgvector** en la misma Postgres de Neon (no Pinecone — un servicio menos, free tier suficiente para MVP).
- Auth: JWT propio con `jose`, refresh tokens en cookie httpOnly, password con `argon2`.

---

## 2. Arquitectura del Sistema

### 2.1 Diagrama lógico (capas)

```
┌──────────────────────────────────────────────────────────────────────┐
│                          CLIENTE (Browser)                           │
│   Angular 20 SPA  ·  Signals  ·  Material + Tailwind  ·  Dark-first  │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ HTTPS (JWT en Authorization header)
                               │ Refresh token en cookie httpOnly
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       VERCEL (Edge / CDN)                            │
│   Static hosting Angular  ·  Edge cache  ·  Preview deployments      │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  AWS API GATEWAY (HTTP API v2)                       │
│   Custom JWT authorizer (Lambda)  ·  Throttling  ·  CORS  ·  WAF*    │
└──────┬───────────────────────────────────────────────────────────────┘
       │
       ├──► Lambda: auth-service       (login, register, refresh, me)
       ├──► Lambda: documents-service  (CRUD docs, presigned URLs)
       ├──► Lambda: ai-orchestrator    (trigger análisis, leer resultados)
       ├──► Lambda: search-service     (full-text + semantic)
       ├──► Lambda: orgs-service       (org/member/invitation mgmt)
       └──► Lambda: billing-service    (Stripe checkout, webhook) [Fase 5]
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│            PIPELINE ASÍNCRONO DE PROCESAMIENTO IA                    │
│                                                                      │
│   S3 (uploads bucket)  ──► EventBridge ──► SQS ──► Lambda workers   │
│                                                       │              │
│                                                       ▼              │
│   1. extract-text   2. summarize   3. classify   4. embed           │
│   (cada paso es una Lambda; orquestadas vía Step Functions opcional) │
└──────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────┐    ┌─────────────────────────────────────┐
│   POSTGRES (Neon)       │    │   AWS S3                            │
│   · users/orgs          │    │   · raw-uploads/{orgId}/{docId}     │
│   · documents           │    │   · extracted-text/                 │
│   · ai_analyses         │    │   · thumbnails/                     │
│   · embeddings(pgvector)│    │   · signed URLs (15 min TTL)        │
│   · activity_logs       │    └─────────────────────────────────────┘
└─────────────────────────┘
                               │
                               ▼
┌─────────────────────────┐    ┌─────────────────────────────────────┐
│   OpenAI API            │    │   CloudWatch  ·  X-Ray              │
│   · gpt-4o-mini         │    │   · Logs estructurados (pino)       │
│   · text-embedding-3-sm │    │   · Métricas + Alarmas              │
└─────────────────────────┘    └─────────────────────────────────────┘

*WAF: opcional, fuera de free tier — se omite en MVP.
```

### 2.2 Flujo end-to-end: subir un documento

```
1. User → Angular: arrastra PDF al uploader
2. Angular → POST /documents (metadata: filename, size, mime)
3. Lambda documents-service:
     - valida JWT, valida org membership, valida tamaño/mime
     - crea fila `documents` (status: 'pending_upload')
     - devuelve presigned PUT URL (S3, expira 5 min)
4. Angular → PUT directo a S3 (no pasa por Lambda — clave para free tier)
5. S3 → evento ObjectCreated → EventBridge → SQS (cola `doc-ingest`)
6. Lambda extract-text-worker:
     - descarga objeto, extrae texto (pdf-parse / mammoth)
     - guarda texto en S3 (extracted-text/) + actualiza documents.status='extracted'
     - publica evento → SQS `doc-analyze`
7. Lambdas en paralelo:
     - summarize-worker → OpenAI → escribe en ai_analyses
     - classify-worker  → OpenAI → escribe en ai_analyses
     - embed-worker     → chunking + embeddings → pgvector
8. Cada worker actualiza documents.status; al terminar todos → 'ready'
9. Frontend hace polling (o SSE en Fase 2) y refresca el dashboard
```

### 2.3 Comunicación entre servicios

| Origen          | Destino             | Mecanismo                                       | Por qué                                                 |
| --------------- | ------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| Browser         | API Gateway         | HTTPS REST                                      | Estándar, simple, cacheable                             |
| API GW          | Lambdas             | Invocación síncrona                             | Latencia baja, request/response                         |
| S3              | Workers             | EventBridge → SQS → Lambda                      | Desacopla upload de procesamiento, soporta retries, DLQ |
| Lambda → Lambda | Workers en pipeline | SQS entre pasos                                 | Aísla fallos, permite reintentos sin re-correr todo     |
| Workers         | Postgres            | Conexión directa con `pg` + RDS Proxy si escala | Neon maneja pooling vía PgBouncer                       |
| Workers         | OpenAI              | HTTPS con retry exponencial                     | SDK oficial `openai`                                    |

---

## 3. Estructura del Monorepo (Nx)

```
clouddocs-ai/
├── apps/
│   ├── web/                          # Angular 20 SPA
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── core/             # Singletons: auth, http, config
│   │   │   │   │   ├── auth/
│   │   │   │   │   ├── interceptors/
│   │   │   │   │   ├── guards/
│   │   │   │   │   └── services/
│   │   │   │   ├── shared/           # Reutilizable: UI atoms, pipes, directives
│   │   │   │   │   ├── ui/           # Botones, inputs, cards (Material wrappers)
│   │   │   │   │   ├── layouts/
│   │   │   │   │   └── utils/
│   │   │   │   ├── features/         # Standalone feature routes (lazy)
│   │   │   │   │   ├── auth/         # login, register
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   ├── documents/    # lista, detalle, upload
│   │   │   │   │   ├── search/
│   │   │   │   │   ├── chat/         # AI chat (Fase 2)
│   │   │   │   │   ├── settings/
│   │   │   │   │   └── billing/      # Fase 5
│   │   │   │   ├── app.routes.ts
│   │   │   │   └── app.config.ts
│   │   │   ├── styles/               # Tailwind + design tokens
│   │   │   └── environments/
│   │   ├── tailwind.config.ts
│   │   └── project.json
│   │
│   └── api/                          # Backend serverless (todas las Lambdas)
│       ├── src/
│       │   ├── handlers/             # Una carpeta por servicio Lambda
│       │   │   ├── auth/
│       │   │   ├── documents/
│       │   │   ├── ai-orchestrator/
│       │   │   ├── search/
│       │   │   ├── orgs/
│       │   │   ├── billing/
│       │   │   └── workers/          # extract-text, summarize, classify, embed
│       │   ├── middlewares/          # auth, error, logging, validation
│       │   ├── lib/                  # repos, db client, openai client, s3 client
│       │   │   ├── db/
│       │   │   ├── ai/
│       │   │   ├── storage/
│       │   │   └── auth/
│       │   └── domain/               # Entidades, types, validators (zod)
│       └── project.json
│
├── libs/
│   ├── shared-types/                 # DTOs compartidos FE↔BE (zod schemas)
│   ├── shared-utils/                 # Helpers puros (fechas, formato, etc.)
│   └── ui-tokens/                    # Design tokens TS (colors, spacing)
│
├── infra/                            # AWS CDK
│   ├── bin/clouddocs.ts              # Entrypoint
│   ├── lib/
│   │   ├── stacks/
│   │   │   ├── network-stack.ts
│   │   │   ├── storage-stack.ts      # S3 buckets, lifecycle policies
│   │   │   ├── api-stack.ts          # API Gateway + Lambdas HTTP
│   │   │   ├── pipeline-stack.ts     # EventBridge + SQS + Lambdas workers
│   │   │   ├── observability-stack.ts# CloudWatch dashboards, alarms
│   │   │   └── secrets-stack.ts      # Secrets Manager / SSM Parameters
│   │   └── constructs/               # Constructs reutilizables
│   ├── cdk.json
│   └── package.json
│
├── tools/
│   └── scripts/                      # bootstrap, seed, migrate
│
├── .github/workflows/
│   ├── ci.yml                        # lint, test, typecheck, build
│   ├── deploy-web.yml                # Vercel via CLI
│   └── deploy-api.yml                # CDK deploy
│
├── docs/
│   ├── architecture.md
│   ├── adr/                          # Architectural Decision Records
│   └── runbooks/
│
├── nx.json
├── package.json                      # pnpm + workspaces declarados por Nx
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
└── README.md                         # Hero, arquitectura, demo, decisiones
```

### 3.1 Convenciones

- **Package manager:** `pnpm` (workspaces nativos, cache eficiente).
- **TS strict en todos los proyectos.** `noImplicitAny`, `strictNullChecks`, `exactOptionalPropertyTypes`.
- **Lint:** ESLint + `@nx/eslint`. Reglas: import/order, no-floating-promises, consistent-type-imports.
- **Format:** Prettier (sin reglas de Angular CLI por defecto, integrado vía Nx).
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`). Commitlint en husky.
- **Branching:** `main` protegida; `feat/*`, `fix/*` con PRs y CI obligatorio.
- **ADRs:** cada decisión arquitectónica relevante se documenta en `docs/adr/NNNN-titulo.md`.

---

## 4. Decisiones Arquitectónicas Justificadas

| Decisión                            | Por qué                                                                                                                                                       | Tradeoffs aceptados                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Angular 20 standalone + Signals** | Stack obligatorio. Signals + zoneless es el futuro de Angular y se ve moderno. Standalone elimina NgModule boilerplate.                                       | Curva de aprendizaje vs Angular clásico. Algunas libs aún asumen NgModules.                       |
| **Nx monorepo**                     | Mejor DX para Angular + libs compartidas. Affected commands ahorran CI time. Dependency graph visual impresiona en demos.                                     | Más config inicial que pnpm workspaces puro.                                                      |
| **AWS Lambda (Node 22 ARM64)**      | Pay-per-use, free tier generoso (1M req/mes, 400 K GB-s). Graviton ARM = 20 % más barato y mejor cold start.                                                  | Cold starts (~300 ms para Node). Límite 15 min ejecución. Stateless.                              |
| **HTTP API Gateway v2**             | 70 % más barato que REST API. JWT authorizer nativo. Soporta CORS y WebSockets.                                                                               | Menos features que REST API (sin request validation rica — se hace en Lambda).                    |
| **Postgres (Neon)**                 | Free tier real (0.5 GB storage, autoscale to zero). Postgres = SQL maduro + JSONB + pgvector en un solo lugar. Branches por entorno (preview = branch de DB). | Latencia variable cold-start (~300 ms primer query). Cuotas en free tier.                         |
| **pgvector vs Pinecone**            | Una sola DB, una sola fuente de verdad, sin coste extra. Suficiente hasta ~1 M vectores.                                                                      | Menos performant que vector stores especializados a escala alta.                                  |
| **S3**                              | Estándar de facto. Free tier 5 GB. Presigned URLs eliminan el paso de subir vía Lambda (gigante win de costo y latencia).                                     | Configurar CORS y lifecycle correctamente.                                                        |
| **AWS CDK TypeScript**              | Misma lengua que backend. Type-safe. Constructs reutilizables. Se ve muy enterprise en portfolio.                                                             | Más verbose que Serverless Framework. CDK Bootstrap requiere setup inicial.                       |
| **EventBridge + SQS para pipeline** | Desacopla upload de procesamiento. SQS da retries automáticos + DLQ. EventBridge filtra eventos de S3 sin código.                                             | Latencia añadida (segundos vs ms). Más servicios = más complejidad operativa.                     |
| **JWT propio con `jose`**           | Control total, sin dependencia de Cognito (más complejo de demostrar). Refresh tokens en httpOnly cookie = XSS-safe.                                          | Hay que mantener rotación de claves, blacklist de tokens revocados.                               |
| **OpenAI gpt-4o-mini**              | $0.15 / 1M input tokens. Calidad sobrada para resúmenes/clasificación.                                                                                        | Vendor lock-in. Mitigación: abstraer detrás de `AiProvider` interface.                            |
| **Multi-tenant via Organizations**  | Modelo SaaS realista (Linear/Notion). Demuestra row-level scoping. Permite invitar miembros.                                                                  | Todo query debe filtrar por `org_id` — error fácil de cometer. Mitigación: `OrgScopedRepository`. |
| **Vercel para FE**                  | Mejor DX Angular SSR opcional, preview deployments por PR, edge CDN gratis.                                                                                   | Vendor lock-in mínimo (es static hosting al fin).                                                 |
| **Stripe para billing**             | Estándar absoluto. Modo test infinito gratis.                                                                                                                 | Webhooks requieren endpoint público confiable.                                                    |

### 4.1 Anti-decisiones explícitas (qué NO usamos y por qué)

- **No usamos Cognito** — demuestra menos código propio; queremos mostrar implementación JWT.
- **No usamos DynamoDB** — Postgres con pgvector cubre tanto datos relacionales como vectores; un servicio menos.
- **No usamos Step Functions en MVP** — SQS + Lambdas encadenadas alcanza. Step Functions entra en Fase 2 si el pipeline crece.
- **No usamos WAF** — fuera del free tier; rate limiting básico vía API Gateway throttling.
- **No usamos CloudFront delante de API** — API Gateway ya tiene TLS y caching. Frontend va por Vercel CDN.
- **No usamos Redis** — caching de respuestas IA va en Postgres con TTL; un servicio menos.

---

## 5. Modelo de Datos

### 5.1 Esquema completo (Postgres)

```sql
-- ============================================================
-- AUTH & ORGS (Multi-tenancy core)
-- ============================================================
CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  plan            TEXT NOT NULL DEFAULT 'free',   -- 'free' | 'pro'
  stripe_customer_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,                  -- argon2
  display_name    TEXT,
  avatar_url      TEXT,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);

CREATE TABLE invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email           CITEXT NOT NULL,
  role            TEXT NOT NULL,
  token           TEXT NOT NULL UNIQUE,
  invited_by      UUID NOT NULL REFERENCES users(id),
  expires_at      TIMESTAMPTZ NOT NULL,
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  user_agent      TEXT,
  ip              INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- DOCUMENTS
-- ============================================================
CREATE TABLE folders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_id       UUID REFERENCES folders(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_folders_org ON folders(org_id);

CREATE TABLE documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  folder_id       UUID REFERENCES folders(id) ON DELETE SET NULL,
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  filename        TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      BIGINT NOT NULL,
  s3_key          TEXT NOT NULL,
  text_s3_key     TEXT,                           -- texto extraído
  thumbnail_s3_key TEXT,
  page_count      INT,
  status          TEXT NOT NULL DEFAULT 'pending_upload',
                  -- pending_upload | uploaded | extracting | extracted
                  -- | analyzing | ready | failed
  error           TEXT,
  language        TEXT,                           -- ISO 639-1
  category        TEXT,                           -- IA classify result
  tags            TEXT[] NOT NULL DEFAULT '{}',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_org ON documents(org_id);
CREATE INDEX idx_documents_org_status ON documents(org_id, status);
CREATE INDEX idx_documents_org_created ON documents(org_id, created_at DESC);
CREATE INDEX idx_documents_tags ON documents USING GIN (tags);
CREATE INDEX idx_documents_search ON documents
  USING GIN (to_tsvector('simple', filename || ' ' || coalesce(category,'')));

CREATE TABLE document_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version         INT NOT NULL,
  s3_key          TEXT NOT NULL,
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);

-- ============================================================
-- AI ANALYSES
-- ============================================================
CREATE TABLE ai_analyses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,                  -- summary | classification | entities | keywords
  model           TEXT NOT NULL,                  -- gpt-4o-mini
  prompt_version  TEXT NOT NULL,                  -- v1, v2 — versionamos prompts
  input_tokens    INT,
  output_tokens   INT,
  cost_usd        NUMERIC(10,6),
  result          JSONB NOT NULL,                 -- {summary: "...", confidence: 0.92, ...}
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_analyses_doc ON ai_analyses(document_id, kind);
CREATE INDEX idx_ai_analyses_org_created ON ai_analyses(org_id, created_at DESC);

-- ============================================================
-- EMBEDDINGS (semantic search)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embeddings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  chunk_index     INT NOT NULL,
  chunk_text      TEXT NOT NULL,
  embedding       vector(1536) NOT NULL,          -- text-embedding-3-small
  token_count     INT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);
CREATE INDEX idx_embeddings_org ON embeddings(org_id);
CREATE INDEX idx_embeddings_vec ON embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- AUDIT & ACTIVITY
-- ============================================================
CREATE TABLE activity_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,                  -- 'document.uploaded', 'auth.login', ...
  target_type     TEXT,                           -- 'document' | 'folder' | 'user'
  target_id       UUID,
  metadata        JSONB NOT NULL DEFAULT '{}',
  ip              INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_org_created ON activity_logs(org_id, created_at DESC);

-- ============================================================
-- BILLING (Fase 5)
-- ============================================================
CREATE TABLE usage_counters (
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start    DATE NOT NULL,                  -- mes
  docs_uploaded   INT NOT NULL DEFAULT 0,
  ai_analyses     INT NOT NULL DEFAULT 0,
  storage_bytes   BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, period_start)
);

CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_sub_id   TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL,                  -- active | past_due | canceled
  current_period_end TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 5.2 Migraciones

- **Herramienta:** `node-pg-migrate` (simple, sin ORM heavyweight).
- **Convención:** un archivo por cambio, nombre `NNNN_descripcion.sql`.
- **Despliegue:** migración corre como paso en `deploy-api.yml` antes del deploy de Lambdas.

### 5.3 Decisión ORM vs SQL puro

- **MVP:** `pg` directo + queries SQL en archivos `.sql` o template strings + función helper `sql\`...\``. Mantiene control y reduce dependencias.
- **Fase 2 (si crece complejidad):** evaluar `kysely` (query builder type-safe sin runtime overhead) o `drizzle`. Evitar TypeORM/Prisma (cold start pesado en Lambda).

---

## 6. Backend Serverless — Diseño Detallado

### 6.1 Mapa de Lambdas y rutas API

| Lambda             | Método | Path                          | Auth       | Descripción                          |
| ------------------ | ------ | ----------------------------- | ---------- | ------------------------------------ |
| `auth-register`    | POST   | `/v1/auth/register`           | público    | Crear user + org default             |
| `auth-login`       | POST   | `/v1/auth/login`              | público    | Email+pass → access + refresh        |
| `auth-refresh`     | POST   | `/v1/auth/refresh`            | cookie     | Rotar refresh, devolver nuevo access |
| `auth-logout`      | POST   | `/v1/auth/logout`             | cookie     | Revocar refresh                      |
| `auth-me`          | GET    | `/v1/auth/me`                 | JWT        | User + memberships                   |
| `orgs-list`        | GET    | `/v1/orgs`                    | JWT        | Orgs del user                        |
| `orgs-create`      | POST   | `/v1/orgs`                    | JWT        | Nueva org                            |
| `orgs-invite`      | POST   | `/v1/orgs/:id/invitations`    | JWT+admin  | Invitar miembro                      |
| `orgs-members`     | GET    | `/v1/orgs/:id/members`        | JWT+member | Listar miembros                      |
| `docs-list`        | GET    | `/v1/documents`               | JWT        | Lista paginada con filtros           |
| `docs-get`         | GET    | `/v1/documents/:id`           | JWT        | Detalle + análisis                   |
| `docs-create`      | POST   | `/v1/documents`               | JWT        | Metadata → presigned URL             |
| `docs-delete`      | DELETE | `/v1/documents/:id`           | JWT        | Soft delete + cleanup S3             |
| `docs-download`    | GET    | `/v1/documents/:id/download`  | JWT        | Presigned GET                        |
| `ai-reanalyze`     | POST   | `/v1/documents/:id/reanalyze` | JWT        | Re-encolar análisis                  |
| `search`           | POST   | `/v1/search`                  | JWT        | Híbrido: full-text + semantic        |
| `chat`             | POST   | `/v1/chat/messages`           | JWT        | RAG sobre embeddings (Fase 2)        |
| `billing-checkout` | POST   | `/v1/billing/checkout`        | JWT        | Stripe Checkout Session              |
| `billing-portal`   | POST   | `/v1/billing/portal`          | JWT        | Stripe Customer Portal               |
| `billing-webhook`  | POST   | `/v1/billing/webhook`         | Stripe sig | Eventos Stripe                       |

**Workers (no expuestos en API):**

- `worker-extract-text` — SQS trigger
- `worker-summarize` — SQS trigger
- `worker-classify` — SQS trigger
- `worker-embed` — SQS trigger

### 6.2 Estructura de un handler

```
handlers/documents/list/
├── handler.ts        # Lambda entry: parse event, call use case, format response
├── usecase.ts        # Lógica de negocio pura, recibe deps inyectadas
├── schema.ts         # zod input/output
└── handler.test.ts   # Unit test del usecase (mockeando repos)
```

### 6.3 Middlewares (composición funcional)

```
withErrorHandler(
  withRequestLogger(
    withJsonBody(
      withAuth(                  // verifica JWT, popula ctx.user
        withOrgScope(            // valida membership en :orgId si aplica
          withValidation(schema, // zod parse del body/query
            handler
          )
        )
      )
    )
  )
)
```

Implementación: HOFs simples, no `middy` para evitar overhead.

### 6.4 Cliente DB en Lambda

- Conexión por invocación con `pg.Client` (no pool por Lambda — sería contraproducente).
- Neon recomienda su driver serverless `@neondatabase/serverless` (usa HTTP/WebSocket, no TCP) — **lo usamos**. Elimina connection-pool issues clásicos de Lambda+Postgres.
- Para queries: helper `sql` con template strings, parametrización segura.

### 6.5 Manejo de secretos

- **AWS Secrets Manager** para: JWT signing keys, OpenAI API key, Stripe secret, Neon connection string.
- Lambdas leen secretos en `init` (fuera del handler) → cacheados durante warm container.
- Rotación manual en MVP; automática (Lambda Rotation) opcional.

### 6.6 Rate limiting y throttling

- API Gateway throttling: 100 req/s burst, 50 req/s sostenido por API.
- Por-usuario: middleware `withRateLimit` usando tabla `rate_limits(user_id, window_start, count)` o Postgres `LISTEN/NOTIFY`. MVP simple: counters en memoria por warm container + límite suave; Fase 2: Redis/Upstash si se necesita estricto.

### 6.7 Cold starts — mitigación

- ARM64 + Node 22 + bundle pequeño (esbuild, tree-shaking, externals para `aws-sdk`).
- Provisioned concurrency: NO en MVP (cuesta). Aceptamos cold starts ~300 ms.
- Esquema: una Lambda por handler (no monolito) — bundles más chicos → cold starts menores.
- Empaque: `esbuild` con `--minify --tree-shaking --format=esm`. Excluir `@aws-sdk/*` (provided por runtime).

---

## 7. Frontend Angular Enterprise

### 7.1 Configuración base

- **Angular 20 standalone components**, sin NgModules.
- **Zoneless** (`provideZonelessChangeDetection()`) — moderno, mejor performance, requiere Signals.
- **Routing:** `provideRouter` con lazy-loading por feature (`loadComponent` + `loadChildren`).
- **HTTP:** `provideHttpClient(withInterceptors([authInterceptor, errorInterceptor, retryInterceptor]))`.
- **State:** Signals + `signalState` patterns. Para state compartido entre features: `@ngrx/signals` (SignalStore) — moderno, mínimo boilerplate.
- **Forms:** Reactive Forms con typed forms.
- **Material 20** + custom theme con CSS variables. Tailwind por encima para utilities (spacing, layout).
- **Iconos:** `lucide-angular` (más moderno que Material Icons).

### 7.2 Estructura por feature

```
features/documents/
├── documents.routes.ts          # rutas lazy
├── pages/
│   ├── documents-list.page.ts
│   ├── document-detail.page.ts
│   └── document-upload.page.ts
├── components/
│   ├── document-card.component.ts
│   ├── document-table.component.ts
│   ├── upload-dropzone.component.ts
│   └── analysis-panel.component.ts
├── services/
│   ├── documents.service.ts     # API client
│   └── upload.service.ts        # presigned PUT flow
├── store/
│   └── documents.store.ts       # SignalStore
└── models/                      # importa shared-types
```

### 7.3 Interceptors

- `authInterceptor` — adjunta `Authorization: Bearer {accessToken}`.
- `errorInterceptor` — mapea 401→refresh+retry, 403→toast, 5xx→banner, propaga tipados.
- `retryInterceptor` — retry exponencial para idempotentes (GET).
- `loadingInterceptor` — actualiza `LoadingService` signal para UI global.

### 7.4 Guards

- `authGuard` — redirige a `/auth/login` si no hay sesión.
- `orgGuard` — valida que la ruta `/orgs/:slug/*` pertenece al user.
- `roleGuard(['owner','admin'])` — para settings.

### 7.5 Layouts

- `auth-layout` — minimal, centrado, branding.
- `app-layout` — sidebar colapsable + topbar + outlet + command palette (cmd+k).
- `settings-layout` — sidebar de secciones.

### 7.6 Dashboard

- Cards de KPIs: docs totales, docs procesados, almacenamiento usado, análisis del mes.
- Feed de actividad reciente (últimos 10 eventos).
- Gráfico de uploads por día (chartjs o apex).
- Quick actions: upload, search.

### 7.7 Real-time updates de status

- MVP: polling cada 3 s cuando hay docs en estado `extracting|analyzing`.
- Fase 2: SSE (`/v1/events/stream`) con Lambda Function URL + streaming.

---

## 8. Features MVP

| #   | Feature                              | Detalle                                                                                          |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 1   | **Auth JWT**                         | Register, login, logout, refresh, /me. Password con argon2. Refresh en httpOnly cookie.          |
| 2   | **Multi-tenant Orgs**                | Crear org al registrarse (auto), invitar miembros por email (token de invitación).               |
| 3   | **Upload PDF/DOCX**                  | Drag&drop, validación cliente (mime, tamaño max 10 MB MVP), presigned PUT, progreso.             |
| 4   | **Extracción de texto**              | Worker async (PDF → pdf-parse; DOCX → mammoth). Texto en S3.                                     |
| 5   | **Resumen IA**                       | gpt-4o-mini, prompt versionado, truncado a 8 K tokens input. Resultado en `ai_analyses`.         |
| 6   | **Clasificación IA**                 | gpt-4o-mini con categorías predefinidas (Contrato, Factura, Reporte, CV, Otro, …) + tags libres. |
| 7   | **Dashboard documentos**             | Lista paginada, filtros (status, categoría, tag, fecha), búsqueda por nombre, vista grid/tabla.  |
| 8   | **Detalle de documento**             | Preview (PDF.js), metadatos, análisis IA, descarga, eliminar, re-analizar.                       |
| 9   | **Búsqueda inteligente (full-text)** | Postgres tsvector sobre filename + categoría + tags. Embeddings llegan en Fase 2.                |
| 10  | **Historial de análisis**            | Lista de análisis previos (versionado de prompts).                                               |

### 8.1 Definición de "Done" del MVP

- Usuario nuevo: registro → upload → ver resumen y categoría < 30 segundos.
- Costo por usuario activo/mes en uso normal: < $0.10.
- 95p latency de listado de docs: < 500 ms.
- App desplegada en dominio personalizado, HTTPS, sin warnings consola.

---

## 9. Features Fase 2

| Feature                          | Notas                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **OCR para PDFs escaneados**     | AWS Textract (caro fuera de free tier — usar solo si confianza baja en extracción) o `tesseract.js` en Lambda con layer. |
| **Embeddings + Semantic Search** | text-embedding-3-small, chunking ~500 tokens overlap 50. Hybrid search: tsvector + cosine similarity.                    |
| **AI Chat con documentos (RAG)** | Streaming responses via Lambda Function URL. Context window: top-K chunks por cosine.                                    |
| **Multi-folder + drag&drop**     | Mover documentos, breadcrumbs, folders anidados.                                                                         |
| **Colaboración: comentarios**    | Comments table, mentions @user, notificaciones.                                                                          |
| **Document sharing público**     | Link con token, opcionalmente con password, expira en X días.                                                            |
| **Audit logs UI**                | Vista de actividad con filtros, export CSV.                                                                              |
| **Notificaciones in-app**        | SSE o WebSockets via API Gateway WebSocket.                                                                              |

---

## 10. Sistema IA

### 10.1 Pipeline conceptual

```
texto extraído
    │
    ├──► [Resumen]      gpt-4o-mini  → resumen + bullets + sentiment
    ├──► [Clasificación] gpt-4o-mini → categoría + confidence + tags
    ├──► [Entidades]    gpt-4o-mini  → personas, orgs, fechas, montos (JSON mode)
    └──► [Embeddings]   text-embedding-3-small por chunk
```

### 10.2 Prompt management

- **Versionado:** cada prompt vive en `apps/api/src/lib/ai/prompts/{kind}/v{N}.ts`.
- **Estructura:** system + user templates + JSON schema esperado.
- **Registro:** cada análisis guarda `prompt_version` → permite re-correr análisis viejos con nuevos prompts.
- **JSON mode:** OpenAI structured outputs con zod schema → garantiza forma.

### 10.3 Chunking strategy

- Sentence-aware splitting (libreria `llm-chunk` o impl propia).
- Tamaño objetivo: ~500 tokens, overlap 50.
- Metadata por chunk: `page_number`, `start_char`, `end_char` → permite citar fuentes en chat.

### 10.4 Optimización de costos OpenAI

| Técnica                                               | Ahorro estimado         |
| ----------------------------------------------------- | ----------------------- |
| `gpt-4o-mini` en lugar de `gpt-4o`                    | ~15x                    |
| Cache de embeddings (mismo chunk hash → reusa)        | 100% en duplicados      |
| Cache de análisis (hash del texto → reusa summary)    | Alto en docs re-subidos |
| Truncar a max input tokens razonable                  | 30-50%                  |
| Batch embeddings (API soporta hasta 2048 inputs/call) | ~30% latencia           |
| OpenAI Batch API para no-urgent                       | 50% costo               |

### 10.5 Abstracción de proveedor

```ts
interface AiProvider {
  summarize(text: string, opts): Promise<SummaryResult>;
  classify(text: string, categories): Promise<ClassifyResult>;
  embed(chunks: string[]): Promise<number[][]>;
  chat(messages, opts): AsyncIterable<string>; // streaming
}
```

Implementaciones: `OpenAiProvider` (MVP), `AnthropicProvider` (futuro). Permite swap sin tocar use cases.

### 10.6 Costos estimados (10 docs/día, ~5 páginas c/u)

- Resumen: ~2K tokens input / 300 output × 10 = ~$0.005/día
- Clasificación: ~1K input / 100 output × 10 = ~$0.002/día
- Embeddings: ~10K tokens × 10 = ~$0.0002/día
- **Total: ~$0.20/mes para uso de demo.** Despreciable.

---

## 11. Estrategia AWS Free Tier

### 11.1 Servicios usados y su free tier

| Servicio               | Free tier                                   | Suficiencia para CloudDocs     |
| ---------------------- | ------------------------------------------- | ------------------------------ |
| **Lambda**             | 1M req/mes + 400 K GB-s                     | Sobrado (~10 K req/mes demo)   |
| **API Gateway HTTP**   | 1M req/mes (12 meses)                       | Sobrado en demo                |
| **S3**                 | 5 GB storage, 20 K GET, 2 K PUT (12 meses)  | Suficiente con lifecycle       |
| **CloudWatch Logs**    | 5 GB ingest, 5 GB storage/mes (always free) | Suficiente si retención corta  |
| **EventBridge**        | 14M eventos/mes (always free)               | Sobrado                        |
| **SQS**                | 1M req/mes (always free)                    | Sobrado                        |
| **Secrets Manager**    | NO free tier — $0.40/secret/mes             | Mínimo: 3 secrets (~$1.20/mes) |
| **CloudWatch Metrics** | 10 custom metrics, 5 GB                     | Suficiente                     |
| **Data Transfer Out**  | 100 GB/mes (always free)                    | Sobrado                        |

### 11.2 Servicios externos (free tier o cuasi-cero)

| Servicio   | Free tier                                                  | Notas                        |
| ---------- | ---------------------------------------------------------- | ---------------------------- |
| **Vercel** | Hobby: 100 GB bandwidth, builds ilimitados, dominio gratis | Suficiente                   |
| **Neon**   | 0.5 GB storage, 190 hrs compute/mes, autoscale to zero     | Suficiente para demo         |
| **OpenAI** | Pay-as-you-go, sin free tier                               | Estimado <$1/mes en uso demo |
| **Stripe** | 0 costo fijo, % por transacción                            | Modo test gratis infinito    |

### 11.3 Riesgos de coste y mitigaciones

| Riesgo                                       | Mitigación                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| Bucket S3 sin lifecycle → crece para siempre | Lifecycle: borrar `raw-uploads/` > 90 días sin acceso. Versioning OFF.              |
| Logs CloudWatch crecen sin retención         | Set `retention: 7 days` en MVP, 30 días en prod.                                    |
| Lambda con bug que loopea (event source SQS) | DLQ obligatoria. Alarma en messages > 10 en cola.                                   |
| Secrets Manager por cada env (dev/prod)      | Usar 1 secret JSON multi-campo en lugar de N secrets.                               |
| Egress S3 grande                             | Servir directo desde frontend Vercel para assets estáticos, S3 solo para docs user. |
| OpenAI key fugada → factura inflada          | Set monthly budget en OpenAI ($5 hard limit). Key en Secrets Manager.               |
| **Billing alarm AWS**                        | CloudWatch Billing Alarm a $5 → SNS → email. Imprescindible día 1.                  |

### 11.4 Coste mensual proyectado en estado idle / demo

| Concepto                                      | Coste                    |
| --------------------------------------------- | ------------------------ |
| Lambda + API GW + S3 + EventBridge + SQS + CW | $0 (dentro de free tier) |
| Secrets Manager (3 secrets)                   | ~$1.20                   |
| Route 53 hosted zone (si dominio custom AWS)  | $0.50                    |
| OpenAI demo usage                             | ~$1                      |
| Neon, Vercel, Stripe test                     | $0                       |
| **Total**                                     | **~$2.70 / mes**         |

---

## 12. Diseño Visual Premium

### 12.1 Filosofía

- **Dark mode first**, light como secundario.
- Inspiración: Linear (espaciado generoso, tipografía limpia), Vercel (gradientes sutiles, mono accents), Stripe (cards elegantes, microinteracciones).
- Densidad media-alta tipo Linear (no tan denso como Notion, no tan vacío como Apple).

### 12.2 Design tokens (TS export desde `libs/ui-tokens`)

```ts
export const tokens = {
  color: {
    // Surfaces (dark)
    bg: '#0A0A0A',
    surface1: '#111111',
    surface2: '#171717',
    surface3: '#1F1F1F',
    border: '#262626',
    borderStrong: '#3A3A3A',
    // Text
    text: '#F5F5F5',
    textMuted: '#A1A1AA',
    textDim: '#71717A',
    // Brand
    brand: '#7C5CFF', // morado eléctrico, distintivo
    brandDim: '#5B3FE0',
    // Semantic
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#3B82F6',
  },
  radius: { sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px' },
  space: { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 6: '24px', 8: '32px', 12: '48px' },
  font: {
    sans: '"Inter Variable", system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,.4)',
    md: '0 4px 12px rgba(0,0,0,.5)',
    glow: '0 0 24px rgba(124,92,255,.25)',
  },
};
```

Estos tokens se exponen como CSS variables (`--cdx-color-bg`) y como utilities Tailwind (`bg-surface-1`, `text-muted`).

### 12.3 Componentes UI clave

- **Button** — variants: primary, secondary, ghost, danger; sizes sm/md/lg; estados loading.
- **Input/Textarea/Select** — con label flotante, error inline, prefix/suffix icons.
- **Card** — surface con border, hover lift sutil, slots header/body/footer.
- **Table** — sticky header, hover row, sort, pagination, selection multi.
- **Dropzone** — drag&drop visual rico, progreso por archivo, retry on error.
- **Toast** — top-right, stackable, severity colors, auto-dismiss.
- **Modal/Sheet** — focus trap, backdrop blur, esc-to-close.
- **CommandPalette** — cmd+k global, fuzzy search docs y acciones.
- **EmptyState** — ilustración minimal + CTA.
- **Skeleton** — shimmer en cards y tablas mientras carga.
- **Avatar/Badge/Tag/Tooltip** — atoms.

### 12.4 Layout principal

```
┌──────────────────────────────────────────────────────────────────┐
│  Topbar   [Logo]     [Cmd+K search]            [Org▾] [Avatar] │
├──────────┬───────────────────────────────────────────────────────┤
│ Sidebar  │                                                       │
│ · Home   │             Main content (max-w-7xl, padded)         │
│ · Docs   │                                                       │
│ · Search │                                                       │
│ · Chat   │                                                       │
│ · ─────  │                                                       │
│ · Sett.  │                                                       │
│ · Billing│                                                       │
└──────────┴───────────────────────────────────────────────────────┘
```

### 12.5 Microinteracciones

- Hover lifts en cards (`translateY(-2px)` + shadow).
- Transitions de 150-200 ms, ease-out.
- Loading: skeletons en vez de spinners donde sea posible.
- Progress bars con shimmer en uploads.
- Subtle glow en CTA primario (sombra brand).

---

## 13. Seguridad

| Vector                       | Mitigación                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Brute force login**        | Rate limit por IP (5 intentos / 5 min), captcha en Fase 2.                                                                              |
| **JWT robado**               | Access token corto (15 min), refresh rotativo, revocable vía `refresh_tokens.revoked_at`.                                               |
| **XSS → token leak**         | Refresh en httpOnly+Secure+SameSite=Lax cookie. Access token en memoria (no localStorage).                                              |
| **CSRF en refresh endpoint** | SameSite=Lax + header custom (`X-CDX-Client`) requerido.                                                                                |
| **Upload malicioso**         | Validar mime real (magic bytes) en worker, no confiar en cliente. Tamaño max 10 MB MVP.                                                 |
| **Cross-tenant access**      | Repositorio `OrgScopedRepository` que aplica `WHERE org_id = $ctx.orgId` automáticamente. Tests aseguran que ningún query crudo escape. |
| **Signed URL S3 abuse**      | TTL 5 min PUT, 15 min GET. Key con prefix `{orgId}/{docId}/` — no enumerable.                                                           |
| **SQL injection**            | Parametrización siempre, nunca string concat. Helper `sql` con template literals.                                                       |
| **Secrets en repo**          | `.env` en gitignore, pre-commit con `gitleaks`. Secrets en AWS Secrets Manager.                                                         |
| **CORS abierto**             | Allowlist exacta: `https://clouddocs.app`, `https://*.vercel.app` (preview).                                                            |
| **Dependency vuln**          | `pnpm audit` en CI; Dependabot/Renovate semanal.                                                                                        |
| **API enumeración**          | IDs UUID v4 (no incremental). Errores 404 idénticos para "no existe" y "no autorizado".                                                 |
| **PII en logs**              | Logger `pino` con redact paths (`req.headers.authorization`, `password`, `email`).                                                      |
| **Webhook Stripe spoof**     | Verificar firma con `stripe.webhooks.constructEvent`.                                                                                   |

### 13.1 Modelo de roles

| Rol      | Permisos                                 |
| -------- | ---------------------------------------- |
| `owner`  | Todo + transferir/eliminar org + billing |
| `admin`  | Invitar/remover miembros, settings org   |
| `member` | CRUD docs propios y de otros miembros    |
| `viewer` | Solo lectura                             |

Enforced en middleware `withRole(...roles)`.

---

## 14. Buenas Prácticas Enterprise

### 14.1 Logging estructurado

- Backend: `pino` con `correlationId` por request (header `x-correlation-id` o uuid generado).
- Cada log incluye: `timestamp`, `level`, `service`, `correlationId`, `userId?`, `orgId?`, `message`, `extra`.
- En Lambda: pino → stdout → CloudWatch Logs.

### 14.2 Monitoring & Observabilidad

- **CloudWatch Dashboards:** una vista por servicio (API errors, latency p95, Lambda duration, SQS depth).
- **Alarms críticas:**
  - 5xx rate > 1% en 5 min
  - Lambda duration p95 > 5s
  - SQS DLQ messages > 0
  - AWS Billing > $5/mes
- **X-Ray tracing** habilitado en Lambdas críticas (deshabilitado por defecto en workers para ahorrar).
- **Sentry** (free tier 5K events/mes) en frontend para errores cliente.

### 14.3 Error handling

- Backend: jerarquía de errores tipados (`AppError`, `ValidationError`, `NotFoundError`, `UnauthorizedError`, `ConflictError`). Middleware `withErrorHandler` mapea a HTTP status + body JSON estable.
- Frontend: `ErrorService` global, toasts para recoverable, error boundary route para fatal.
- Errores con `correlationId` visible al usuario (`Error ID: abc-123`) → facilita soporte.

### 14.4 Typed APIs end-to-end

- `libs/shared-types` define DTOs como **zod schemas**.
- Backend: zod parsea input y output.
- Frontend: tipos inferidos con `z.infer<typeof Schema>`.
- Una sola fuente de verdad → cero drift FE/BE.

### 14.5 Testing

| Capa                      | Herramienta                                                | Cobertura objetivo                     |
| ------------------------- | ---------------------------------------------------------- | -------------------------------------- |
| Unit (use cases)          | Vitest                                                     | 80% en `lib/` y `usecase.ts`           |
| Integration (Lambda + DB) | Vitest + Testcontainers Postgres                           | Happy paths críticos                   |
| E2E API                   | Vitest + supertest contra `sam local` o serverless-offline | Auth + upload + search                 |
| Unit Angular              | Vitest + Angular Testing Library                           | Servicios y components puros           |
| E2E Frontend              | Playwright                                                 | Flujos críticos: login, upload, search |
| Visual regression         | Playwright + screenshot                                    | Páginas principales en dark/light      |

CI ejecuta todo en PR; merge bloqueado si falla.

### 14.6 CI/CD

```
.github/workflows/ci.yml
  triggers: push, PR
  jobs:
    - install (cache pnpm)
    - lint    (nx affected:lint)
    - typecheck
    - test    (nx affected:test)
    - build   (nx affected:build)
    - e2e     (solo en main o label run-e2e)
```

```
.github/workflows/deploy-api.yml
  triggers: push a main, paths apps/api/** infra/**
  jobs:
    - build api
    - cdk synth
    - cdk deploy --require-approval never (env: production)
    - run migrations (node-pg-migrate)
    - smoke test (curl /v1/health)
```

```
.github/workflows/deploy-web.yml
  triggers: push a main, paths apps/web/**
  jobs:
    - build
    - vercel deploy --prod
  PRs → vercel preview automático (via Vercel GitHub app)
```

### 14.7 Environment management

| Env        | Frontend              | Backend                             | DB                                 |
| ---------- | --------------------- | ----------------------------------- | ---------------------------------- |
| local      | `nx serve web`        | `nx serve api` (serverless-offline) | Neon branch `dev` o local Postgres |
| preview    | Vercel preview por PR | AWS stack `clouddocs-preview`       | Neon branch por PR (auto)          |
| production | Vercel prod           | AWS stack `clouddocs-prod`          | Neon main branch                   |

Variables: `.env.local` (gitignored) + AWS Secrets Manager. Cliente: `apps/web/src/environments/*.ts` + variables build-time Vercel.

---

## 15. Roadmap por Fases

Estimaciones para trabajo solo, dedicación part-time (~10-15 h/sem).

| Fase          | Nombre                             | Duración    | Entregables                                                                                                                                                                         |
| ------------- | ---------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0**         | **Foundation**                     | 1 sem       | Nx workspace creado, pnpm, ESLint+Prettier, Husky, README inicial, repo público, billing alarm AWS, AWS account + CDK bootstrap, dominio comprado.                                  |
| **1**         | **Infra base (CDK)**               | 1 sem       | Stacks: network, storage (S3 buckets), api (API GW + healthcheck Lambda), observability básico. Deploy a `dev`.                                                                     |
| **2**         | **Auth + Multi-tenant**            | 2 sem       | Tablas users/orgs/memberships, Lambdas auth (register/login/refresh/me/logout), middleware JWT. Frontend: login/register, layouts, auth interceptor, guards. Tests unit + e2e auth. |
| **3**         | **Upload + Storage**               | 1.5 sem     | Tabla documents, Lambda docs-create con presigned URL, S3 CORS, frontend dropzone con progreso, lista de documentos básica.                                                         |
| **4**         | **AI Processing pipeline**         | 2.5 sem     | EventBridge + SQS + workers (extract-text, summarize, classify), prompt management, ai_analyses table, polling de status en frontend, detalle de documento con análisis.            |
| **5**         | **Dashboard + Search (full-text)** | 1.5 sem     | Dashboard con KPIs, filtros avanzados, búsqueda tsvector, activity_logs, command palette.                                                                                           |
| **6**         | **Polish + Deploy producción**     | 1 sem       | Diseño visual pulido, dark mode toggle, microinteracciones, dominio prod, Vercel prod, CDK prod, Sentry, monitoring dashboards, README hero, demo video, **publicación**.           |
| **MVP listo** | —                                  | **~10 sem** | Producto demostrable, deployado, documentado.                                                                                                                                       |
| **7**         | **Embeddings + Semantic Search**   | 2 sem       | pgvector, chunking, embed worker, hybrid search endpoint.                                                                                                                           |
| **8**         | **AI Chat con documentos (RAG)**   | 2 sem       | Streaming Lambda Function URL, conversación, citas con page refs.                                                                                                                   |
| **9**         | **Folders + Sharing + Comments**   | 2 sem       | Folders nested, share links, comments con mentions.                                                                                                                                 |
| **10**        | **Stripe Billing**                 | 1.5 sem     | Checkout, customer portal, webhook, usage_counters, gating de features Pro.                                                                                                         |
| **11**        | **OCR + Notifications + Audit UI** | 2 sem       | Tesseract.js layer, notificaciones in-app, vista de audit logs con filtros/export.                                                                                                  |

Total post-MVP: ~9.5 semanas adicionales. Cada fase se puede pausar/publicar individualmente.

---

## 16. Riesgos Técnicos y Mitigaciones

| Riesgo                                  | Probabilidad | Impacto | Mitigación                                                                                                                                      |
| --------------------------------------- | ------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Costos AWS se disparan**              | Baja         | Alto    | Billing alarm $5 desde día 1; lifecycle S3; log retention 7d; secrets agrupados; revisar dashboard semanalmente.                                |
| **Costos OpenAI se disparan**           | Baja         | Medio   | Hard budget en OpenAI ($5/mes); validación de tamaño doc en cliente y servidor; cache de análisis por hash.                                     |
| **Cold starts inaceptables**            | Media        | Medio   | ARM64 + bundle minificado + esbuild + Lambda por handler; aceptamos 300 ms; provisioned concurrency solo si métricas lo justifican.             |
| **PDFs muy grandes (>10 MB)**           | Media        | Medio   | Límite hard 10 MB en MVP; trabajadores Lambda con 1 GB RAM, 5 min timeout; rechazar con mensaje claro; Fase 2: chunked upload + Textract async. |
| **PDFs escaneados sin texto**           | Alta         | Medio   | MVP: detectar texto vacío post-extracción → status `needs_ocr` → mostrar mensaje "habilita OCR (Fase 2)".                                       |
| **Neon free tier llega al límite**      | Baja         | Medio   | Monitorear storage; archivar embeddings de orgs inactivas; ofrecer plan Pro.                                                                    |
| **OpenAI down / rate limit**            | Media        | Medio   | Retry exponencial; SQS DLQ; estado `failed` con botón retry para usuario.                                                                       |
| **Cross-tenant data leak (bug)**        | Baja         | Crítico | OrgScopedRepository obligatorio; tests específicos por endpoint que crean user en otra org e intentan acceso; revisión code review enfocada.    |
| **Migración rompe prod**                | Media        | Alto    | Migraciones siempre backwards-compatible (add column, no drop); deploy = migrate primero, código después; rollback plan documentado.            |
| **Vendor lock-in OpenAI**               | Baja         | Bajo    | `AiProvider` abstracta desde día 1 → swap a Anthropic/local en horas.                                                                           |
| **Sebastián pierde momentum por scope** | Alta         | Alto    | Roadmap por fases con entregables atómicos; cada fase se puede publicar y demoear; no avanzar a siguiente fase sin haber publicado la actual.   |

---

## 17. Deploy Final — Plan

### 17.1 Cuentas y dominios requeridos

- AWS account (root + IAM user con MFA)
- Vercel account (GitHub connected)
- Neon account
- OpenAI account con API key + budget
- Stripe account (test mode primero)
- Dominio: ej. `clouddocs.app` (Cloudflare DNS recomendado por DX + DNSSEC gratis)
- Sentry account (free tier)

### 17.2 Estructura de entornos

```
clouddocs.app         → Vercel prod (apps/web)
api.clouddocs.app     → API Gateway prod (custom domain)
*.vercel.app/preview  → Vercel preview por PR
api-dev.clouddocs.app → API Gateway dev
```

### 17.3 Variables de entorno

**Frontend (Vercel project settings):**

- `NEXT_PUBLIC_API_URL` (sí, naming legacy) → `https://api.clouddocs.app/v1`
- `NEXT_PUBLIC_STRIPE_PK`
- `NEXT_PUBLIC_SENTRY_DSN`

**Backend (AWS Secrets Manager, JSON único `clouddocs/prod`):**

```json
{
  "DATABASE_URL": "...",
  "JWT_PRIVATE_KEY": "...",
  "JWT_PUBLIC_KEY": "...",
  "OPENAI_API_KEY": "...",
  "STRIPE_SECRET_KEY": "...",
  "STRIPE_WEBHOOK_SECRET": "...",
  "ALLOWED_ORIGINS": "https://clouddocs.app"
}
```

### 17.4 Procedimiento de primer deploy

```
1. cdk bootstrap aws://<account>/us-east-1
2. Crear Secrets en Secrets Manager (manualmente vía CLI con valores prod)
3. cdk deploy --all --context env=prod
4. Configurar custom domain en API Gateway → ACM cert (DNS validation)
5. Apuntar CNAME api.clouddocs.app → execute-api endpoint
6. Run migrations: pnpm migrate:prod
7. Vercel: connect repo, set env vars, deploy
8. Apuntar A/CNAME clouddocs.app → Vercel
9. Smoke test: curl /v1/health, login flow, upload de doc demo
10. Configurar Sentry, configurar Stripe webhook URL
```

### 17.5 Rollback

- Lambdas: CDK rollback con `cdk deploy` de commit previo (Lambda versioning automático).
- DB: migraciones idempotentes y reverse scripts. Snapshot Neon antes de migración grande.
- Frontend: Vercel "Promote to production" de deployment previo (1 click).

---

## 18. Verificación End-to-End

### 18.1 Escenario 1 — Onboarding y subida

1. Visitar `clouddocs.app` → landing carga sin errores, dark mode por defecto.
2. Click "Get started" → `/auth/register`, formulario con validación inline.
3. Registrar `demo@test.com` → redirige a `/dashboard`, org default creada, sidebar visible.
4. Ir a Documents → click "Upload" → arrastrar PDF de 1 MB.
5. Ver toast "Upload started", progreso 0-100%, fila aparece en tabla con status `extracting`.
6. Polling actualiza a `analyzing` → `ready` en < 30s.
7. Click en documento → detalle con preview, resumen visible, categoría asignada, tags.

### 18.2 Escenario 2 — Búsqueda y filtros

1. Subir 5 documentos variados (CV, contrato, factura, reporte, manual).
2. Dashboard muestra KPIs actualizados.
3. Buscar "contrato" → resultados filtrados correctamente.
4. Filtrar por categoría "Factura" → solo facturas visibles.
5. Filtrar por tag → funciona.

### 18.3 Escenario 3 — Multi-tenancy

1. Como `userA` en `orgA`, subir docA.
2. Logout. Registrar `userB` en `orgB`.
3. Intentar `GET /v1/documents/{docA.id}` con token de userB → 404.
4. Intentar listar documentos → solo ve docs de orgB.
5. Invitar userA a orgB → userA acepta → ahora ve docs de ambas.

### 18.4 Escenario 4 — Resilencia

1. Setear OpenAI key inválida temporalmente → subir doc.
2. Worker falla → reintento → falla 3 veces → mensaje a DLQ.
3. Status doc = `failed`, error visible al usuario.
4. Botón "Re-analyze" → encola de nuevo (con key buena) → completa.

### 18.5 Escenario 5 — Deploy productivo

1. Merge PR a main → CI verde.
2. GitHub Action `deploy-web` desplegado a Vercel prod (~2 min).
3. GitHub Action `deploy-api` corre `cdk diff` → `cdk deploy` → migrate → smoke test (~5 min).
4. Verificar https://clouddocs.app responde, https://api.clouddocs.app/v1/health = 200.
5. Sentry sin nuevos errores en 1 hora post-deploy.
6. CloudWatch dashboard verde.

### 18.6 Checklist final pre-publicación portfolio

- [ ] README con hero image, demo URL, video 60s (Loom), arquitectura diagram (mermaid/excalidraw).
- [ ] `docs/architecture.md` completo.
- [ ] ADRs en `docs/adr/` para top-5 decisiones.
- [ ] LICENSE (MIT).
- [ ] CONTRIBUTING.md (incluso si nadie contribuye, demuestra rigor).
- [ ] Demo account con datos sample.
- [ ] Lighthouse > 90 en performance/accessibility.
- [ ] No errores consola en navegación normal.
- [ ] Tweets/posts de lanzamiento preparados.

---

## 19. Critical files / paths (referencia rápida para ejecución)

Cuando comencemos a programar (fuera de este plan), los archivos más críticos serán:

- `nx.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` — bootstrap del workspace
- `infra/lib/stacks/api-stack.ts` — define API Gateway + Lambdas
- `infra/lib/stacks/pipeline-stack.ts` — EventBridge + SQS + workers
- `apps/api/src/lib/db/client.ts` — Neon serverless driver setup
- `apps/api/src/middlewares/with-auth.ts` — verificación JWT
- `apps/api/src/middlewares/with-org-scope.ts` — enforcement multi-tenant
- `apps/api/src/handlers/documents/create/handler.ts` — presigned URL flow
- `apps/api/src/handlers/workers/extract-text.ts` — pipeline trigger
- `apps/api/src/lib/ai/prompts/summary/v1.ts` — prompt versionado
- `apps/web/src/app/app.config.ts` — providers globales (zoneless, http, router)
- `apps/web/src/app/core/auth/auth.service.ts` — auth state con Signals
- `apps/web/src/app/features/documents/services/upload.service.ts` — presigned PUT flow
- `libs/shared-types/src/schemas/documents.ts` — zod DTOs
- `libs/ui-tokens/src/tokens.ts` — design tokens
- `.github/workflows/deploy-api.yml`, `deploy-web.yml` — pipelines
- `docs/architecture.md`, `docs/adr/0001-monorepo-nx.md` — documentación

---

## 20. Próximo paso recomendado

Una vez aprobado este plan, propongo arrancar por **Fase 0 + Fase 1** en una primera sesión:

1. Crear el workspace Nx con apps `web` y `api`, libs `shared-types`, `shared-utils`, `ui-tokens`.
2. Configurar tooling (ESLint, Prettier, Husky, Commitlint, Vitest, Playwright).
3. Bootstrap del proyecto CDK con stacks vacíos.
4. Healthcheck Lambda deployada a AWS dev.
5. README inicial con arquitectura y roadmap visible.

Esto da una base sólida sobre la que iterar sin re-trabajo, y ya muestra estructura profesional en el repo desde el primer commit.

---

_Fin del plan técnico — listo para ejecución por fases._
