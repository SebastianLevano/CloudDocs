/**
 * Runtime environment for the web app.
 *
 * `apiBaseUrl` points at the live auth API deployed in sa-east-1. CORS on the
 * API allows the `http://localhost:4200` dev origin with credentials, so the
 * Angular dev server talks to the real backend out of the box — no local
 * mock needed.
 *
 * NOTE: there is a single environment file for now (Phase 2C). When we wire a
 * production build target we'll add a `fileReplacements` entry in
 * `project.json` swapping this for `environment.prod.ts`.
 */
export const environment = {
  production: false,
  /** API Gateway HTTP v2 endpoint (no trailing slash). */
  apiBaseUrl: 'https://ngm5oizp91.execute-api.sa-east-1.amazonaws.com',
};
