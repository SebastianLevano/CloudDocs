/**
 * Production environment, swapped in for `environment.ts` by the `production`
 * build configuration (see project.json `fileReplacements`). Same API endpoint
 * as dev for now (single sa-east-1 backend); `production: true` enables prod
 * behaviour and is the hook for any future prod-only config.
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://ngm5oizp91.execute-api.sa-east-1.amazonaws.com',
};
