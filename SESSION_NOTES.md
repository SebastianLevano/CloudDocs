# Session Notes — 2026-05-21 (Fase 1 deploy ✅)

> Handoff document. Read this first when resuming work on CloudDocs AI.

## Estado actual

**Fase 0 (Foundation) — DONE** (sesión previa).
**Fase 1 (Infra base / CDK) — DEPLOYED a AWS dev account `637423184400` (us-east-1).**

### Outputs reales (2026-05-21 18:40 UTC)

- HttpApiUrl: `https://dz0mae9v1d.execute-api.us-east-1.amazonaws.com`
- HealthCheckUrl: `https://dz0mae9v1d.execute-api.us-east-1.amazonaws.com/v1/health` → **HTTP 200 ok**
- UploadsBucketName: `clouddocs-dev-uploads-637423184400`
- AlertsTopicArn: `arn:aws:sns:us-east-1:637423184400:clouddocs-dev-alerts`
- BillingAlarmName: `clouddocs-dev-billing-over-5usd` (estado **OK**, lectura `EstimatedCharges=0.0`)
- AWS profile: `clouddocs-dev` (IAM user `clouddocs-deploy` con AdministratorAccess)

Smoke test: `{"status":"ok","service":"clouddocs-api","version":"0.1.0",...}` en ~1.1s cold / 0.7s warm.

Lo que existe ahora:

```
infra/                                  # Proyecto CDK independiente (fuera del pnpm workspace)
├── package.json                        # Deps propias: aws-cdk-lib 2.180, constructs, esbuild, ts-node
├── tsconfig.json
├── cdk.json                            # `cdk synth` → cdk.out/
├── .npmrc                              # engine-strict
├── bin/clouddocs.ts                    # CDK App entry: instancia los 4 stacks
└── lib/
    ├── config.ts                       # Loader de config tipado por stage (dev|staging|prod)
    ├── constructs/
    │   └── nodejs-handler.ts           # Construct propio: bundle local con esbuild API
    └── stacks/
        ├── network-stack.ts            # Vacío a propósito (serverless, sin VPC en MVP)
        ├── storage-stack.ts            # S3 uploads + lifecycle (IA 30d, expire 90d) + CORS
        ├── api-stack.ts                # HTTP API v2 + healthcheck Lambda Node 22 ARM64
        └── observability-stack.ts      # SNS topic + Billing alarm $5 (us-east-1 obligado)

.github/workflows/
├── ci.yml                              # ⚠️ Reescrito (era el template Nx Cloud con node 20+npm)
└── deploy-api.yml                      # Manual trigger, OIDC role, smoke-test al final
```

**Verificación local realizada:**

- `cd infra && npm install` ✅ (31 paquetes, Node 22.22.3).
- `npm run typecheck` ✅ (tsc --noEmit limpio).
- `cdk synth` ✅ con env dummy → 4 plantillas CloudFormation generadas en `cdk.out/`.
- Bundle del healthcheck Lambda ✅ (CJS, 47 líneas, exporta `handler`, sourcemap inline).

**No se hizo ninguna llamada a AWS.**

## Decisiones técnicas tomadas (gotchas a recordar)

- **Construct `NodejsHandler` propio, NO `NodejsFunction`.** `NodejsFunction` detecta
  `pnpm-lock.yaml` en la raíz y trata de invocar `pnpm exec -- esbuild …`. En esta
  máquina, ese subprocess llama al shim corepack de pnpm y rompe con
  `ERR_UNKNOWN_BUILTIN_MODULE node:sqlite` porque corepack re-execs bajo el Node 20
  del sistema (no el 22 de nvm). Solución: usar `lambda.Function` + `Code.fromAsset`
  con `bundling.local.tryBundle` que llama a `esbuild.buildSync` directamente desde
  `infra/node_modules`. Bonus: bundling determinista en CI y desacoplado del package
  manager del workspace. Documentado en `infra/lib/constructs/nodejs-handler.ts`.
- **`logRetention` (deprecado) → `LogGroup` explícito.** El prop `logRetention` de
  Lambda está deprecado; ahora cada handler tiene su propio `LogGroup` con
  `RetentionDays.TWO_WEEKS` y `RemovalPolicy.DESTROY` (en dev).
- **`@aws-sdk/*` external** en el bundle — el runtime Node 22 de Lambda ya lo trae.
  Ahorra ~30 MB por función.
- **Observability stack pin a us-east-1** independientemente del region del app —
  AWS publica `EstimatedCharges` solo en us-east-1 cada ~6h.
- **Billing alarm $5 sólo dispara si el root account tiene "Receive Billing Alerts"
  habilitado** (Billing → Preferences). Documentado como CfnOutput.
- **`ALERT_EMAIL` es env var obligatoria** para sintetizar — config.ts lanza si falta.
  Mantiene la suscripción SNS explícita y revisable.
- **Stacks con prefijo `clouddocs-${stage}-`** → `clouddocs-dev-{network,storage,api,observability}`.
- **CORS permisivo en S3 y HTTP API (`*`)** sólo en Fase 1 — `// TODO Phase 6:` apuntando
  al cierre con el dominio real cuando exista.
- **`ci.yml` original reemplazado.** El que generó Nx asumía Node 20 + npm + Nx Cloud
  conectado (que SESSION_NOTES anterior dice está disponible pero no enchufado). El
  nuevo usa pnpm 11.1.3, Node 22 vía `.nvmrc`, y `nx affected -t lint test build typecheck`.

## Pendientes inmediatos

| Item                    | Quién         | Cómo                                                                                |
| ----------------------- | ------------- | ----------------------------------------------------------------------------------- |
| **Commit del scaffold** | Yo, con tu OK | Hay 14 archivos sin commit (infra/, workflows, SESSION_NOTES, MEMORY del proyecto). |

### Nota — drift en la suscripción SNS

La suscripción que creó CDK durante el deploy se borró por accidente (Sebastián clickeó
"Unsubscribe" en vez de "Confirm subscription" — el botón de Gmail está visualmente
cerca). Re-creada por CLI:

```
arn:aws:sns:us-east-1:637423184400:clouddocs-dev-alerts:20af8355-4702-428b-aa19-85e49d39a599
```

`PendingConfirmation: false`, lista para recibir alertas. CDK no la conoce (vive fuera
de CloudFormation). Si se necesita reconciliar más adelante: `cdk import` o redeploy
de `clouddocs-dev-observability` después de añadir explícitamente la suscripción al
stack vía un construct nuevo.

## Pendientes diferibles (no bloqueantes)

| Item                                   | Cuándo                      | Cómo                                                                                                                                                                                |
| -------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub OIDC role para `deploy-api.yml` | Antes del 2do deploy via CI | Crear IAM role con trust policy OIDC → repo `SebastianLevano/CloudDocs` (o tu repo), permisos para CloudFormation/S3/Lambda/IAM/SNS/CloudWatch. Secret `AWS_DEPLOY_ROLE_ARN` en GH. |
| Custom domain                          | Fase 6                      | Dominio comprado + Route 53 hosted zone + ACM cert + `apigwv2.DomainName`.                                                                                                          |
| MFA en root account                    | Cuanto antes                | Best practice de seguridad — no bloquea esta fase pero hay que cerrarlo.                                                                                                            |
| Restringir IAM `clouddocs-deploy`      | Antes de Fase 5             | Hoy tiene AdministratorAccess. Cambiar a un policy mínimo (CloudFormation + servicios usados) cuando empecemos a tocar billing.                                                     |

## Próximos pasos (Fase 2)

Plan §15 — Fase 2 = Auth + multi-tenant orgs. Estimación ~1-2 semanas part-time.

1. Lib `libs/auth/` con argon2 + jose para JWT.
2. Lambda `auth-service` con handlers: register, login, refresh, me.
3. Schema Neon Postgres: `users`, `organizations`, `org_members`, `refresh_tokens`.
4. `OrgScopedRepository` enforcing `WHERE org_id = ?`.
5. Custom JWT authorizer Lambda en API Gateway.
6. Stack nuevo `clouddocs-dev-auth` (o ampliar `api-stack.ts`).

## Pasos exactos para retomar la sesión

```bash
cd /Users/sebasprincipal/CloudDocs
source ~/.nvm/nvm.sh && nvm use         # Node 22 desde .nvmrc
pnpm install                            # Workspace deps (ya cacheado)
pnpm nx run-many -t lint test build     # Sanity check (debe ser verde + cached)

cd infra
npm install                             # Si no instalaste aún
AWS_ACCOUNT_ID=000000000000 ALERT_EMAIL=test@example.com npx cdk synth --quiet  # Validar
```

Para arrancar el deploy: dime **"Empezamos deploy de Fase 1"** y avanzo en pasos
con confirmación tuya antes de cada `cdk bootstrap` / `cdk deploy`.

## Stacks deployados (estado real)

| Stack                         | Recursos                                                                           | Coste idle   |
| ----------------------------- | ---------------------------------------------------------------------------------- | ------------ |
| `CDKToolkit`                  | Bootstrap CDK (S3 staging + ECR + IAM roles)                                       | $0           |
| `clouddocs-dev-network`       | (vacío)                                                                            | $0           |
| `clouddocs-dev-storage`       | S3 `clouddocs-dev-uploads-637423184400` + policy SSL-enforce + auto-delete         | $0 free tier |
| `clouddocs-dev-api`           | Lambda `clouddocs-dev-health` (Node 22 ARM64, 256 MB) + HTTP API v2 + LogGroup 14d | $0 free tier |
| `clouddocs-dev-observability` | SNS `clouddocs-dev-alerts` + email sub + alarma `clouddocs-dev-billing-over-5usd`  | $0           |

Total esperado en idle: **$0** los primeros 12 meses. Si la billing alarm dispara,
algo se está cobrando y hay que investigar.

## Archivos clave para retomar

- `infra/lib/constructs/nodejs-handler.ts` — Patrón para futuras Lambdas TS en Fase 2+.
- `infra/lib/config.ts` — Loader tipado por stage. Agregar campos aquí cuando aparezcan
  nuevas dependencias (Neon URL, OpenAI key arn de Secrets Manager, etc).
- `infra/bin/clouddocs.ts` — Composición de stacks. Añadir nuevos stacks aquí.
- `apps/api/src/handlers/health/handler.ts` — Plantilla de futuros handlers.
- `docs/plan.md` — Fuente de verdad del plan completo.

## Comandos de referencia (infra)

```bash
# Desde infra/, con Node 22 activo:
npm run typecheck                       # tsc --noEmit
npm run synth                           # cdk synth (necesita ALERT_EMAIL + AWS creds)
npm run diff                            # cdk diff vs cuenta real
npm run deploy:dev                      # cdk deploy --all --context stage=dev
npx cdk destroy --all                   # Bajar todo (cuidado en prod)

# Desde el repo root:
pnpm graph                              # Grafo Nx del workspace (no incluye infra/)
pnpm nx affected -t lint test build     # Lo que correrá CI
```
