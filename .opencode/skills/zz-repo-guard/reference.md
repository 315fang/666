# ZZ Repo Guard Reference

> Source of truth: repository code. If this document conflicts with code, code wins.

## Scope

- API: `backend/app.js` + `backend/routes/**/*.js`
- Frontend config: `admin-ui` + `agent-portal`

## Scan Stamp

- last_scan_at: 2026-04-05
- git_branch: merge/local-main-20260217
- git_commit: 971ae9a

## API Snapshot

- Backend mount roots confirmed from `backend/app.js`:
  - `/api` (auth/products/orders/addresses/distribution/users/config and related)
  - `/api/cart`, `/api/categories`, `/api/wallet`, `/api/commissions`, `/api/agent`, `/api/activity`, `/api/splash`, `/api/page-content`
  - `/api/portal/auth`, `/api/portal`
  - `/admin/api`, `/admin/api/themes`, `/admin/api/logs`, `/admin/api/heat`
  - conditional: `/api/debug`

- Portal endpoint domain confirmed from `backend/routes/portal/*`:
  - auth: login (open), profile/password-change (protected)
  - business routes protected via `authenticatePortal`

## Frontend Config Snapshot

- `admin-ui`:
  - axios base: `/admin/api`
  - Vite dev proxy: `/admin/api -> http://127.0.0.1:3001`

- `miniprogram`:
  - API base from `miniprogram/config/env.js`
  - request layer normalizes `/api/api` and supports `/admin/api` host-root rewrite

- `agent-portal`:
  - source config/composable files not present in this checkout
  - snapshot derived from generated artifacts (`.nuxt/.output`)
  - observed calls align mainly to `/api/portal/*`, plus `/api/stations` exception

## Drift Notes

- `reference.md` was stale (`pending`) before this scan; updated from runtime code and artifacts.
- Skill contract expects `agent-portal/nuxt.config.ts` scan, but source file missing in this checkout; used generated artifacts with reduced confidence.
- `zz-project-standards` references `zz-api-atlas` sync target, which is not found in repository.
- Dual mount exists for theme routes (`/api/themes` and `/admin/api/themes`); route-level auth boundaries should be reviewed carefully during changes.
