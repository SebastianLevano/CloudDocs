# Session Notes — 2026-05-20 / 21

> Handoff document. Read this first when resuming work on CloudDocs AI.

## What was actually completed

**Fase 0 (Foundation) — DONE.** Lo que llamamos "Fase 1" en la pregunta original
era en realidad Fase 0 según el roadmap del plan (`docs/plan.md` §15). Fase 1
(CDK / AWS infra) **no está empezada** y es lo siguiente.

## Estado del repo

- Branch: `main` · 3 commits limpios.
- Path: `/Users/sebasprincipal/CloudDocs`
- Node 22.22.3 (via `.nvmrc` + nvm `default → 22`), pnpm 11.1.3.
- Verificación verde end-to-end: `pnpm lint`, `pnpm test`, `pnpm build`,
  `pnpm typecheck` pasan sobre 6 proyectos.

```
apps/
├── web/        Angular 21 standalone + zoneless + Tailwind v4 (dark-first landing premium)
├── web-e2e/    Playwright (sin tests aún)
└── api/        Node 22 Lambda + esbuild bundle + vitest (health handler funcional)
libs/
├── shared-types/   zod DTOs (HealthResponseSchema)
├── shared-utils/   assert / unreachable
└── ui-tokens/      design tokens TS sincronizados con styles.css
docs/
├── plan.md     Plan técnico completo aprobado (fuente de verdad)
└── adr/        0001-monorepo-nx.md, 0002-aws-cdk-iac.md
```

## Fase 0 — Entregables

| #   | Entregable                                                                               | Estado |
| --- | ---------------------------------------------------------------------------------------- | ------ |
| 1   | Node 22 + pnpm 11 + Nx 22 + workspace `@clouddocs/source`                                | ✅     |
| 2   | Angular 21 app `web` con zoneless, Tailwind v4, landing page premium                     | ✅     |
| 3   | Node app `api` con health handler tipo Lambda + test                                     | ✅     |
| 4   | 3 libs (`shared-types`, `shared-utils`, `ui-tokens`) con path mappings                   | ✅     |
| 5   | Tooling: ESLint flat, Prettier, Husky (pre-commit + commit-msg), lint-staged, commitlint | ✅     |
| 6   | README hero + `docs/plan.md` + 2 ADRs                                                    | ✅     |
| 7   | Verificación end-to-end (lint, test, build, typecheck)                                   | ✅     |

## Decisiones técnicas tomadas (gotchas a recordar)

- **Angular 21**, no 20 (es el stable actual; @nx/angular 22 lo trajo). Plan
  actualizado en README.
- **TS path-mapping** en `tsconfig.base.json`, no project references — el
  compilador Angular aún no soporta refs ([angular#37276](https://github.com/angular/angular/issues/37276)).
  ADR 0001.
- **Tailwind v4 con `styles.css`** (no `.scss`) — evita warnings de
  deprecación de `@import` en Dart Sass. Component styles siguen siendo SCSS.
- **`bundle: true`** en `@nx/esbuild:esbuild` del api — con `bundle: false` el
  executor reportaba success pero no emitía output. Verificado con esbuild
  directo. Salida única `dist/apps/api/main.js`.
- **`strict-peer-dependencies=false`** + **`engine-strict=true`** en `.npmrc`.
- **`allowBuilds` allowlist** en `pnpm-workspace.yaml` para pnpm@11 supply-chain
  policy: esbuild, lmdb, msgpackr-extract, `@parcel/watcher`, less, nx,
  `@swc/core`, unrs-resolver.
- **Lint-staged** usa `eslint --fix` + `prettier --write` directos, NO
  `nx affected --uncommitted` (que producía "outside of base path" warnings).
- **Nx Cloud** disponible pero no conectado intencionalmente — link en el
  output original si se quiere activar.

## Pendientes antes de Fase 1

| Item                                | Necesario para              | Cómo                                                                                                                                             |
| ----------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| AWS CLI configurado                 | **Bloqueador Fase 1**       | `brew install awscli && aws configure --profile clouddocs-dev`. IAM user con AdministratorAccess solo para dev, MFA en root. Region `us-east-1`. |
| Cuenta AWS con MFA                  | Idem                        | Si no existe ya: crear, activar MFA en root, crear IAM user.                                                                                     |
| Dominio (opcional pero recomendado) | Custom domain para API y FE | `clouddocs.app` o similar. Cloudflare o Route 53. Se puede dejar para Fase 6.                                                                    |
| Cuenta Neon                         | DB                          | Crear org gratuita en neon.tech, copiar connection string. Se necesita en Fase 2, no Fase 1.                                                     |

## Fase 1 — Próxima sesión (según plan §15)

**Estimación:** ~1 semana part-time. Entregables:

1. `infra/` CDK project (deps propias, no en pnpm workspace).
2. Stacks vacíos: `network`, `storage`, `api`, `observability`.
3. Bucket S3 para uploads con lifecycle policy (borrar > 90 días sin acceso).
4. API Gateway HTTP v2 + custom domain placeholder.
5. Healthcheck Lambda desplegada y respondiendo en
   `https://api-dev.<dominio>/v1/health`.
6. **CloudWatch billing alarm a $5** — crítico día 1.
7. GitHub Actions: `ci.yml` (lint/test/build affected) + `deploy-api.yml`.

## Pasos exactos para retomar

```bash
cd /Users/sebasprincipal/CloudDocs
nvm use                              # Node 22 desde .nvmrc
pnpm install                         # Reverificar deps
pnpm nx run-many -t lint test build  # Sanity check (debe ser verde)
```

Cuando todo siga verde, decirme: **"Empezamos Fase 1 — CDK bootstrap"**.

Yo haré:

1. `infra/package.json` independiente con `aws-cdk-lib`, `constructs`, etc.
2. `infra/bin/clouddocs.ts` (entry CDK)
3. `infra/lib/stacks/{network,storage,api,observability}-stack.ts`
4. Construct de la healthcheck Lambda apuntando a
   `apps/api/src/handlers/health/handler.ts`
5. `cdk.json`, `tsconfig.json` del proyecto CDK
6. Workflow `.github/workflows/deploy-api.yml`
7. `cdk bootstrap aws://<account>/us-east-1` (con tu confirmación)
8. `cdk deploy --all` (con tu confirmación antes de aplicar)
9. `curl` al endpoint para verificar

## Comandos de referencia

```bash
pnpm graph                                    # Visualizar grafo Nx en browser
pnpm nx serve web                             # Frontend dev server en :4200
pnpm nx run api:build                         # Build Lambda bundle
node dist/apps/api/main.js                    # Ejecutar el handler local
pnpm nx test web --watch                      # Tests Angular en watch
pnpm nx affected -t lint test build           # Solo afectados (CI-style)
git log --oneline                             # Ver historial
cat docs/plan.md                              # Plan técnico completo (fuente de verdad)
```

## Archivos clave si necesitas orientarte

- `docs/plan.md` — Fuente de verdad de arquitectura, modelo de datos, costos,
  seguridad, roadmap.
- `nx.json`, `tsconfig.base.json`, `pnpm-workspace.yaml` — Config raíz.
- `apps/api/src/handlers/health/handler.ts` — Patrón para futuros Lambda
  handlers.
- `apps/web/src/app/app.config.ts` — Providers de la app (zoneless, router,
  http, animations).
- `apps/web/src/app/features/landing/landing.page.ts` — Patrón para futuras
  feature pages (standalone, OnPush, inline template + Tailwind).
- `libs/shared-types/src/schemas/health.ts` — Patrón para futuros zod schemas
  compartidos FE↔BE.
- `libs/ui-tokens/src/tokens.ts` — Design tokens (sincronizar manualmente con
  `apps/web/src/styles.css` por ahora).
