# ADR 0003 — JWT auth with in-memory access token + httpOnly refresh cookie

- **Status:** Accepted
- **Date:** 2026-05-25

## Context

CloudDocs needs authentication that demonstrates ownership of the auth flow
(the project deliberately avoids Cognito — see plan §4.1) while being safe to
run as a public portfolio app. Two clients touch it: the Angular SPA (served
from Vercel in prod, `localhost:4200` in dev) and the AWS HTTP API (Lambdas
behind `*.execute-api.<region>.amazonaws.com`). Crucially these live on
**different sites**, which shapes the cookie decision below.

The threats we care about for a portfolio MVP: XSS exfiltrating long-lived
credentials, token theft, and CSRF against the cookie-authenticated endpoints.

## Decision

**Two-token model.**

- **Access token** — short-lived (15 min) Ed25519/EdDSA JWT signed with `jose`.
  Carries `sub`, `email` and `memberships` (orgId + role) so most requests need
  no DB read. Sent as `Authorization: Bearer <jwt>`.
- **Refresh token** — opaque 256-bit random value, long-lived. Stored in the DB
  only as a SHA-256 hash (`refresh_tokens.token_hash`) and rotated on every
  refresh; the previous token is revoked, so a replayed refresh is rejected
  (401). Delivered to the browser as an HttpOnly cookie (`cdx_rt`).

**Where the tokens live on the client.**

- Access token: **in memory only** (an Angular signal), never `localStorage` /
  `sessionStorage`. An XSS payload can't read it from a JS-reachable store, and
  it expires in 15 min regardless.
- Refresh token: **HttpOnly cookie** — unreadable from JS, so XSS can't steal
  it. On a fresh page load the SPA calls `POST /v1/auth/refresh` to swap the
  cookie for a new access token (`APP_INITIALIZER` runs this before the first
  route activates).

**Cookie attributes — and the cross-site twist.**

The SPA and the API are on different sites, so a `SameSite=Lax` cookie would
**not** be sent on the cross-site XHR to `/refresh` or `/logout` — silent
refresh and cross-tab session restore would silently break. We therefore set:

```
cdx_rt=<token>; Path=/v1/auth; Max-Age=...; HttpOnly; SameSite=None; Secure
```

`SameSite=None` requires `Secure`, which our code forces on in that mode.
`Path=/v1/auth` keeps the cookie off documents/search/etc. The mode is
env-driven (`COOKIE_SAMESITE`, default `None`) so a future same-site setup —
e.g. a custom domain proxying the API under the app's own origin — can switch
back to `Lax` without code changes.

**CSRF defense (because `SameSite=None` removes the implicit one).**

The `refresh` and `logout` handlers require a custom request header
`X-CDX-Client` (`middlewares/with-csrf.ts`). A cross-site request cannot set a
non-safelisted header without a CORS preflight, and the API's CORS config only
allows known origins (`allowOrigins` allowlist + `allowHeaders` includes
`x-cdx-client`). A forged page on an attacker origin therefore fails preflight
and never reaches the handler. Only the header's _presence_ is checked — the
protection comes from the browser's preflight, not the value.

**Password hashing.** argon2id (64 MiB, 3 iterations) via `hash-wasm` — a pure
WASM build that esbuild can inline for the Lambda bundle. Native argon2 bindings
ship platform `.node` binaries that don't bundle for Linux ARM64 (see
SESSION_NOTES / project memory). Trade-off: ~2–3× slower than native (~200 ms),
acceptable for this workload.

## Consequences

- ✅ XSS can't read either credential (access token not in JS storage; refresh
  cookie HttpOnly).
- ✅ Stolen access token is useless after 15 min; refresh rotation makes a
  stolen refresh token single-use and detectable (replay → 401).
- ✅ Works cross-site today (Vercel ↔ execute-api) without a proxy.
- ⚠️ `SameSite=None` widens the CSRF surface; mitigated by the `X-CDX-Client`
  preflight gate. If the API later moves same-site, switch `COOKIE_SAMESITE=Lax`
  and the custom header becomes belt-and-suspenders.
- ⚠️ Changing cookie attributes requires redeploying the auth Lambdas; the CORS
  `allowHeaders` change requires redeploying the API stack.
- ⚠️ No server-side access-token revocation list — revocation is bounded by the
  15 min lifetime. A blacklist can be added later if needed.
- ⚠️ The in-memory access token is lost on full page reload; restored via the
  refresh cookie on boot, so a working refresh cookie is required for "stay
  logged in" to feel seamless.
