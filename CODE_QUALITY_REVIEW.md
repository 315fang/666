# Code Quality Assessment

Scope: static review of the Node.js/Express backend (`backend`) and WeChat mini program (`qianduan`). No code changes were executed. Findings are ordered by severity.

## Test Status
- `npm install` (backend) failed with `Exit handler never called` using npm 11.6.2, so no automated scripts could be run in this environment.

## Key Findings
1) **Weak secret handling and debug toggles**: Default JWT secrets remain in `backend/config/constants.js:67-106`; if `NODE_ENV` is mis-set or secrets are missing in non-prod, the app will sign tokens with known defaults. Debug/test routes also auto-enable when `NODE_ENV !== 'production'`, risking accidental exposure in staging. Centralise a required config check for all environments, not just production (`backend/server.js:10-125`).

2) **CORS and static hosting risks**: `backend/app.js:31-39` sets `origin: '*'` while `credentials: true`, which browsers reject and can hide real CORS problems. Combined with broad static serving of `/uploads` (`backend/app.js:85-86`) there is no path allowlist or cache control, increasing exposure of uploaded assets.

3) **Lack of request validation**: Controllers rely on ad-hoc checks (e.g., login flow `backend/controllers/authController.js:47-119`, order creation `backend/controllers/orderController.js:28-210`) without schema-level validation or normalization. Malformed payloads can slip through, and error messaging is inconsistent, making it hard to guarantee invariants before DB writes.

4) **Background tasks without coordination**: Recurring jobs in `backend/server.js:50-108` run on `setInterval` with no locking or backoff. In multi-instance deployments or under slow DB conditions, tasks (commission settlement, auto-cancel, etc.) can overlap or double-process records.

5) **Hard-coded production endpoints in the mini program**: The API base URL is hard-coded twice (`qianduan/app.js:10`, `qianduan/utils/request.js:9-13`) with no environment switching. Any staging build will still hit production services unless code is patched, raising incident risk.

6) **Observability and test coverage gaps**: There are no automated tests in the repo and minimal structured logging. Critical flows (authentication, settlement, refund) lack metrics or trace IDs, making regressions hard to detect and debug.

## Recommended Next Steps
- Enforce required secrets/config in all environments and disable debug/test routes by default.
- Replace ad-hoc validation with a shared schema layer (e.g., Joi/Zod) and consistent error responses.
- Add a scheduler with locking (DB advisory locks or a queue worker) so background jobs cannot double-run across instances.
- Externalize API base URLs for the mini program via environment-driven config and remove duplicated literals.
- Introduce smoke tests for auth/order flows and a minimal logging/metrics baseline to regain observability.
