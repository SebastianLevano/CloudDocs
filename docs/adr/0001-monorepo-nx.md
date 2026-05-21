# ADR 0001 — Use Nx + pnpm for the CloudDocs AI monorepo

- **Status:** Accepted
- **Date:** 2026-05-20

## Context

CloudDocs AI ships an Angular frontend, a TypeScript Lambda backend, an AWS CDK
infrastructure project and several shared libraries (DTOs, utilities, design
tokens). The repo needs to support fast incremental builds, type-safe imports
across projects and a single dependency graph that CI can use to run only what
has actually changed.

## Decision

Use **Nx 22** on top of **pnpm workspaces** as the monorepo tool, with the
following layout:

- `apps/web` (Angular 21 standalone, Tailwind v4, zoneless)
- `apps/api` (Node 22 Lambda handlers, esbuild bundling)
- `libs/shared-types`, `libs/shared-utils`, `libs/ui-tokens` (publishable
  internally via path mappings in `tsconfig.base.json`)
- `infra/` (AWS CDK, owns its own dependencies — not in the pnpm workspace
  glob to keep the toolchains isolated)

The legacy path-mapping TS setup is used instead of Nx's newer project-reference
setup because the Angular compiler does not yet support project references
(see https://github.com/angular/angular/issues/37276).

## Consequences

- ✅ `nx affected` cuts CI time dramatically once the project grows.
- ✅ Type-safe imports between FE and BE via `@clouddocs/shared-types`.
- ✅ Nx generators give us consistent scaffolding for new Lambdas, libs and
  Angular components.
- ⚠️ More configuration than a plain pnpm workspace — accepted because the
  generators and graph visualisations are valuable to the portfolio narrative.
- ⚠️ Locked into Nx's executors; mitigation: most targets fall back to plain
  commands (`vitest run`, `tsc`, etc.) so the tooling is replaceable.
