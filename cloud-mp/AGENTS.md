# AGENTS.md

## Scope

`cloud-mp` is a CloudBase-first repo with these primary surfaces:

- `miniprogram/`: WeChat Mini Program user app
- `admin-ui/`: Vite + Vue admin frontend
- `cloudfunctions/`: CloudBase business functions, including `admin-api`
- `scripts/`: release, audit, import, repair, and verification entry points
- `docs/`: current runbooks and audit artifacts

## Source Of Truth

- Mini Program request routing lives in `miniprogram/utils/requestRoutes.js`.
- Mini Program request plumbing lives in `miniprogram/utils/request.js`.
- Admin frontend routes live in `admin-ui/src/router/index.js`.
- Admin write/read traffic should continue to go through `/admin/api/*` into `cloudfunctions/admin-api`.
- Current runtime source of truth is CloudBase, not MySQL migration assets.

## Commands

Run from repo root unless noted:

- Install root tooling: `npm install`
- Shared module sync: `npm run sync:shared`
- Verify shared sync only: `npm run check:shared`
- Foundation checks: `npm run check:foundation`
- Production gate: `npm run check:production`
- Release gate alias: `npm run release:check`
- Admin API tests: `npm run test:admin-api`
- All cloudfunction tests: `npm run test:cloudfunctions`
- Route audit: `npm run audit:miniprogram-routes`
- Runtime smoke: `npm run runtime:smoke`
- Payment readiness: `npm run payment:ready`
- Import prep: `npm run import:prep`
- Seed prep chain: `npm run seed:prepare`

Admin UI commands run from `admin-ui/`:

- `npm install`
- `npm run check`
- `npm run dev`
- `npm run build`
- `npm run preview`

## Preferred Workflows

- Mini Program changes: inspect page -> `miniprogram/utils/requestRoutes.js` -> `miniprogram/utils/request.js` -> target `cloudfunctions/<module>/index.js`.
- Admin changes: inspect route -> `admin-ui/src/api/**` -> target view -> `cloudfunctions/admin-api/src/app.js`.
- Release or environment work: start with `docs/CLOUDBASE_RELEASE_RUNBOOK.md` and `docs/CLOUD_MP_DEVELOPMENT_GUIDE.md`.
- Before release-facing work, prefer this baseline:
  - `npm run check:foundation`
  - `npm run audit:miniprogram-routes`
  - `npm run test:admin-api`
  - `cd admin-ui && npm run build`

## Notes

- `scripts/` contains many one-off audit and repair commands; prefer the named `npm run` entries in root `package.json` over invoking ad hoc scripts directly.
- TODO: `docs/CLOUD_MP_DEVELOPMENT_GUIDE.md` still lists `README.md` and `升级.md` as primary references, but those files are not present at the repo root in this checkout.
