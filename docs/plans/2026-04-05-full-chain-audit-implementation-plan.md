# Full Chain Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete a full-chain audit of this repository with progressive detail, parallel subagent checks, and evidence-backed risk grading.

**Architecture:** First build a single baseline map of runtime mounts/config/auth boundaries. Then dispatch parallel subagents on independent chains (transaction, distribution, operations config, portal+skill drift). Finally consolidate all findings into one deduplicated risk ledger and remediation path.

**Tech Stack:** Node.js/Express routes, Vue admin API modules, Nuxt portal config, WeChat miniprogram request layer, git + shell scanning commands, skill-based workflow.

---

### Task 1: Build Baseline Route and Config Map

**Files:**
- Modify: `docs/plans/2026-04-05-full-chain-audit-report.md` (create section: Baseline Map)
- Read: `backend/app.js`
- Read: `backend/routes/**/*.js`
- Read: `admin-ui/vite.config.js`
- Read: `agent-portal/nuxt.config.ts`
- Read: `miniprogram/utils/request.js`

**Step 1: Create baseline checklist (expected unknowns first)**

Create checklist items in report with initial status `unknown`:
- backend mount prefixes
- frontend base/proxy/env
- auth boundaries

**Step 2: Run scan commands for runtime mounts/config**

Run:
```bash
git status --short
```
Expected: command succeeds; capture workspace baseline.

Run:
```bash
git rev-parse --abbrev-ref HEAD
```
Expected: returns current branch name.

Run (PowerShell):
```powershell
Select-String -Path backend\app.js -Pattern 'app\.use\('
```
Expected: mount lines found.

**Step 3: Write minimal baseline map**

Fill report table with:
- mount prefix -> route module
- frontend app -> API base/proxy source file
- auth middleware boundaries

**Step 4: Verify baseline map completeness**

Run spot-check against 3 random route files; expected: each file is represented by at least one baseline row.

**Step 5: Checkpoint**

No commit unless user explicitly requests commit.

---

### Task 2: Audit Transaction Chain (Login to Payment Callback)

**Files:**
- Modify: `docs/plans/2026-04-05-full-chain-audit-report.md` (section: Transaction Chain)
- Read: `backend/routes/auth.js`
- Read: `backend/routes/orders.js`
- Read: `backend/services/OrderCoreService.js`
- Read: `miniprogram/pages/**/index.js` (order/cart/product related)
- Read: `miniprogram/utils/request*.js`

**Step 1: Define transaction assertions**

Assertions:
- login path alignment
- cart/order path alignment
- payment callback route exists and is reachable by mounted prefix
- order status transition has service entry

**Step 2: Run key static checks**

Run:
```powershell
Get-ChildItem -Recurse backend\routes\*.js | Select-String 'router\.(get|post|put|delete|patch)\('
```
Expected: order/auth/payment related endpoints listed.

Run search on miniprogram API calls for login/cart/order keywords.

**Step 3: Record topology and evidence**

Document chain nodes:
login -> product -> cart -> order -> prepay -> notify -> order update.

**Step 4: Grade issues (P0/P1/P2)**

P0 examples: callback path mismatch, auth bypass, missing core route.

**Step 5: Checkpoint**

No commit unless user explicitly requests commit.

---

### Task 3: Audit Distribution and Commission Chain

**Files:**
- Modify: `docs/plans/2026-04-05-full-chain-audit-report.md` (section: Distribution Chain)
- Read: `backend/services/CommissionService.js`
- Read: wallet/commission related controllers and routes under `backend/routes/**`
- Read: miniprogram distribution/wallet pages and API calls

**Step 1: Define critical-gate assertions (@zz-critical-gates)**

Must verify:
- balance + ledger in same transaction
- no direct balance writes outside wallet service
- atomic updates for concurrent deductions
- idempotency for grant operations
- backend recalculates user-submitted amount intent

**Step 2: Run focused scans for money/concurrency patterns**

Scan for:
- transaction wrappers
- direct `balance` updates
- potential read-modify-write without lock/atomic guard

**Step 3: Build chain map and evidence rows**

Record:
invite/bind -> team relation -> commission create -> settle -> withdraw.

**Step 4: Risk grade with explicit rule linkage**

For each high-risk finding, link violated rule number from `zz-critical-gates`.

**Step 5: Checkpoint**

No commit unless user explicitly requests commit.

---

### Task 4: Audit Operations Config Chain

**Files:**
- Modify: `docs/plans/2026-04-05-full-chain-audit-report.md` (section: Operations Config Chain)
- Read: admin config API modules under `admin-ui/src/api/modules/`
- Read: backend config routes/controllers/services
- Read: miniprogram homepage/config consumption pages

**Step 1: Define config drift assertions**

Check:
- admin write API path matches backend mount
- backend aggregation field names align with miniprogram consumption
- default/fallback behaviors are explicit

**Step 2: Run path and field scans**

Search for:
- `homepage-config`, `configs`, `banners`, `mini-program-config`
- frontend field reads vs backend response keys

**Step 3: Record end-to-end path**

Document chain:
admin save -> backend store/aggregate -> miniprogram render.

**Step 4: Mark drift severity**

P1 for path/field mismatch affecting content delivery; P2 for stale docs only.

**Step 5: Checkpoint**

No commit unless user explicitly requests commit.

---

### Task 5: Audit Portal Chain and Skill Drift

**Files:**
- Modify: `docs/plans/2026-04-05-full-chain-audit-report.md` (section: Portal + Skill Drift)
- Read: `agent-portal/nuxt.config.ts`
- Read: `agent-portal/composables/useApi.ts`
- Read: `.opencode/skills/zz-repo-guard/SKILL.md`
- Read: `.opencode/skills/zz-repo-guard/reference.md`
- Read: `.opencode/skills/zz-project-standards/SKILL.md`

**Step 1: Define drift assertions (@zz-repo-guard)**

Check:
- documented scan stamp exists and is current
- API snapshot/front-config snapshot are not pending
- docs/code conflicts resolved in favor of runtime code

**Step 2: Run portal/auth/base checks**

Verify:
- portal auth middleware path coverage
- API base env usage
- portal endpoint paths align to backend `/api/portal/*`

**Step 3: Record drift notes**

List each mismatch with:
- source file evidence
- impact
- overwrite/update recommendation

**Step 4: Severity grading**

P1 for auth/base mismatch; P2 for stale governance docs only.

**Step 5: Checkpoint**

No commit unless user explicitly requests commit.

---

### Task 6: Consolidate, Deduplicate, and Prioritize

**Files:**
- Modify: `docs/plans/2026-04-05-full-chain-audit-report.md` (final sections)

**Step 1: Merge all subagent outputs**

Normalize issue format:
- chain
- file:line
- evidence command
- severity
- minimal fix

**Step 2: Resolve conflicts by authority order**

Order:
1) runtime route/config source files
2) service/controller flow
3) docs

**Step 3: Produce final remediation path**

Buckets:
- 24h stop-the-bleeding (P0)
- 3-day stabilization (P1)
- next-iteration governance cleanup (P2)

**Step 4: Verification pass**

Run a final consistency check: every issue must include both file evidence and command evidence.

**Step 5: Checkpoint**

No commit unless user explicitly requests commit.

---

### Task 7: Optional Reference Update (Only If User Wants Repo Skill Artifacts Updated)

**Files:**
- Modify: `.opencode/skills/zz-repo-guard/reference.md`

**Step 1: Prepare update patch from final evidence**

Fill:
- scan stamp
- API snapshot
- frontend config snapshot
- drift notes

**Step 2: Re-scan conflicting sections before writing**

If conflict found, overwrite conflicting sections from code truth.

**Step 3: Verify no pending placeholders remain**

Expected: no `pending` entries in scan stamp/snapshots.

**Step 4: Final review**

Ensure update only touches governance reference content.

**Step 5: Checkpoint**

No commit unless user explicitly requests commit.
