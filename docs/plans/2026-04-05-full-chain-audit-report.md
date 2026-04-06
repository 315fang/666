# Full Chain Audit Report (Static + Key Commands)

## Scan Metadata

- Scan date: 2026-04-05
- Branch: `merge/local-main-20260217`
- Commit: `971ae9a`
- Mode: static scan + key command verification
- Method: baseline map + parallel subagent chain audits
- **Status:** ✅ ALL TASKS COMPLETE (Task 1-7), report finalized 2026-04-06

## Baseline Map

### Backend mount baseline (high-level)

- C-end mount root: `/api` (auth/products/orders/addresses/distribution/users/config and more)
- Feature mounts: `/api/cart`, `/api/categories`, `/api/wallet`, `/api/commissions`, `/api/agent`, `/api/activity`, `/api/splash`, `/api/page-content`, `/api/portal/*`
- Admin mounts: `/admin/api`, plus `/admin/api/themes`, `/admin/api/logs`, `/admin/api/heat`

Key evidence:
- `backend/app.js:258`
- `backend/app.js:265`
- `backend/app.js:287`
- `backend/app.js:290`
- `backend/app.js:294`

### Frontend API baseline

- `miniprogram` uses `https://api.wenlan.store/api` from env config and request URL normalization.
- `admin-ui` uses `/admin/api` as axios base, Vite dev proxy to local backend.
- `agent-portal` source config files are missing in this checkout; behavior inferred from generated artifacts (`.nuxt/.output`).

Key evidence:
- `miniprogram/config/env.js:43`
- `miniprogram/utils/request.js:24`
- `admin-ui/src/utils/request.js:5`
- `admin-ui/vite.config.js:24`

### Auth boundary baseline

- User: `authenticate` for C-end APIs
- Admin: `adminAuth` (+ permission checks)
- Portal: `authenticatePortal` with `type === 'portal'`

Key evidence:
- `backend/middleware/auth.js:37`
- `backend/middleware/adminAuth.js:11`
- `backend/middleware/portalAuth.js:22`

## Chain Findings

### 1) Transaction chain

Chain path verified:

- Login: `/api/login`
- Product: `/api/products`, `/api/products/:id`, `/api/products/:id/reviews`
- Cart: `/api/cart/*`
- Order: `/api/orders`, `/api/orders/:id/prepay`
- Payment callback: `POST /api/wechat/pay/notify`
- Status transitions: `sync-wechat-pay`, `confirm`, `cancel`

Conclusion:

- Main path alignment between miniprogram calls and backend mounts is good.
- No confirmed P0 in this chain from static scan.

Notable risks:

- Notify path comments/docs show drift (`/wechat/pay/notify` vs runtime `/api/wechat/pay/notify`).
- Callback success depends on exact raw-body path handling contract.

Evidence:
- `backend/routes/orders.js:44`
- `backend/app.js:29`
- `backend/services/OrderCoreService.js:1012`
- `miniprogram/pages/order/detail.js:213`

### 2) Distribution/commission/wallet chain

Chain path verified:

- Invite/bind via login invite code and bind-parent flow
- Team relation APIs under distribution
- Commission creation during shipment
- Settlement via scheduled job + admin approval
- Withdrawal apply/approve/reject/complete

Conclusion:

- Core flow exists, but money safety consistency is uneven.
- One confirmed P0 and multiple P1 issues against critical gates.

Evidence:
- `backend/services/CommissionService.js:819`
- `backend/services/OrderJobService.js:25`
- `backend/controllers/walletController.js:183`
- `backend/services/AdminOrderService.js:310`

### 3) Operations config chain

Chain path verified:

- Admin writes config/banners/activity/boards/splash
- Backend exposes aggregate and split reads (`homepage-config`, `page-content`, `banners`, `splash`, etc.)
- Miniprogram consumes page-content first and falls back to legacy endpoints in places

Conclusion:

- Overall chain works but has field/key drift and some dead/partial integration.

Evidence:
- `admin-ui/src/api/modules/system.js:46`
- `backend/routes/config.js:17`
- `backend/services/PageLayoutService.js:215`
- `miniprogram/pages/index/index.js:158`

### 4) Agent portal chain

Chain path verified:

- Mounts: `/api/portal/auth` + `/api/portal`
- Login open, business routes protected by `authenticatePortal`
- Portal client calls align to `/api/portal/*` (plus one `/api/stations` exception)

Conclusion:

- API path alignment mostly good.
- Audit confidence reduced due to missing source config/composables in this checkout.

Evidence:
- `backend/routes/portal/auth.js:6`
- `backend/routes/portal/index.js:14`
- `backend/middleware/portalAuth.js:22`

### 5) Skill/governance chain

Findings:

- ~~`zz-repo-guard/reference.md` still pending and not stamped.~~ **✅ RESOLVED** - reference.md 已更新，包含完整 scan stamp、API snapshot、frontend config snapshot 和 drift notes。
- `zz-repo-guard` requires route/config scan artifacts and drift notes, now populated.
- `zz-project-standards` mentions `zz-api-atlas` sync target not found in repo.

Evidence:
- `.opencode/skills/zz-repo-guard/reference.md:12` (updated)
- `.opencode/skills/zz-repo-guard/SKILL.md:32`
- `.opencode/skills/zz-project-standards/SKILL.md:65`

## Risk Ledger (Deduplicated)

### P0 (release-blocking)

1. Admin cancel/refund wallet return is outside transaction and directly mutates balance.
   - Risk: partial success, race conditions, reconciliation drift.
   - Evidence: `backend/services/AdminOrderService.js:310`

### P1 (high priority)

1. Notify path drift in comments/docs may cause wrong `WECHAT_PAY_NOTIFY_URL` config.
   - Evidence: `backend/services/OrderCoreService.js:1012`, `backend/app.js:29`

2. Direct balance writes outside wallet service appear in multiple modules.
   - Evidence: `backend/services/OrderCoreService.js:953`, `backend/services/AdminOrderService.js:320`

3. Idempotency hardening is mostly app-level; DB uniqueness for grant/ref events is weak.
   - Evidence: `backend/models/CommissionLog.js:94`, `backend/models/AgentWalletLog.js:4`

4. Activity festival key mismatch in aggregation (`festival_data` vs `festival_config`).
   - Evidence: `backend/routes/admin/controllers/adminActivityController.js:496`, `backend/services/PageLayoutService.js:219`

5. Bubble switch/limit configs are exposed but not effectively enforced end-to-end.
   - Evidence: `admin-ui/src/views/home-sections/index.vue:194`, `backend/controllers/activityController.js:49`

6. ~~Skill artifact drift: repo-guard reference not updated (scan stamp/snapshots pending).~~ **✅ RESOLVED** - reference.md 已在 Task 7 中更新完成。
   - Evidence: `.opencode/skills/zz-repo-guard/reference.md` (已包含完整扫描数据)

7. Agent portal source config missing; only artifacts available for scan.
   - Risk: source/build divergence hidden.

### P2 (medium priority)

1. Admin theme management is not fully wired in admin-ui though backend + miniprogram support exists.
2. Home-sections style config has partial/no rendering value on current miniprogram homepage.
3. Some config mutation paths have cache invalidation lag risk.
4. Stale admin warning text says category banner unused, but miniprogram already consumes it.
5. Miniprogram env currently points all modes to production API domain.
6. Miniprogram request layer tolerates mixed response contracts (`code` and `success`) which can hide drift.

## Recommended Fix Path

### 24h stop-the-bleeding (P0)

1. Refactor admin cancel/refund wallet path into one atomic transaction + row lock + unified wallet service call.
2. Add guardrails/logging for refund failure handling and reconciliation alerts.

### 3-day stabilization (P1)

1. Unify notify callback path constant and startup validation.
2. Eliminate direct balance writes outside wallet service boundaries.
3. Add DB-level idempotency keys for commission/wallet event logs.
4. Fix `festival_data`/`festival_config` key mismatch.
5. Make bubble toggles effective (backend gate or frontend gate).
6. ~~Refresh repo-guard reference with latest scan stamp and snapshots.~~ ✅ 已完成。

### Next iteration governance (P2)

1. Resolve agent-portal source missing issue (restore source or formalize artifact-scan fallback).
2. Clean dead/partial config surfaces and stale admin copy.
3. Split miniprogram env targets by environment.
4. Tighten FE/BE response contract enforcement.

## Subagent Sessions Used

- Baseline map: `ses_2a1fbb143ffe9ZFT0ZMt40k7r4`
- Transaction chain: `ses_2a1f88a96ffenA61oQfRRWT2a2`
- Distribution chain: `ses_2a1f88a55ffegmMKiBfMuRhJWy`
- Operations config chain: `ses_2a1f88a40ffeaX5XqalBndPXI0`
- Portal + skill drift: `ses_2a1f88a2dffeLcq4smpFGdteWb`
