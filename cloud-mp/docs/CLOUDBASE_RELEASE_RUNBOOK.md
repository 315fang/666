# CloudBase Release Runbook

Updated: 2026-04-18

This runbook is the current release and上线检查入口 for `cloud-mp`.

## 1. Scope

This runbook covers:

- local verification before release
- CloudBase environment checks
- admin-ui build and upload prerequisites
- function deployment sequence
- known risks that must be reviewed before traffic cutover

It does not replace field-truth docs or one-off audit snapshots.

## 2. Current runtime position

- mini program runtime: CloudBase
- admin runtime: `cloudfunctions/admin-api`
- formal data source: CloudBase
- `mysql/` remains a migration and historical asset set, not the formal production runtime source

## 3. Local verification baseline

The following checks were re-verified locally on 2026-04-18:

- `node --test "cloudfunctions/admin-api/test/*.test.js"` passed
- `npm run check:foundation` passed
- `cd admin-ui && npm run build` passed
- `npm run audit:miniprogram-routes` should be run against the repaired route-audit script that now reads `miniprogram/utils/requestRoutes.js`

Recommended command set:

```powershell
cd C:\Users\21963\WeChatProjects\zz\cloud-mp
node --test "cloudfunctions/admin-api/test/*.test.js"
npm run check:foundation
npm run audit:miniprogram-routes

cd C:\Users\21963\WeChatProjects\zz\cloud-mp\admin-ui
npm run build
```

## 4. Release blockers to review manually

Current code review findings mean release reviewers should explicitly check:

1. `admin-api` CloudBase precise writes do not bypass `collectionPrefix`
2. cold-start readiness does not fail open into half-loaded collections
3. collection writes do not rely on unsafe full-collection rewrite behavior for hot business collections
4. runtime does not accidentally enable `ADMIN_DATA_SOURCE=mysql`

These are not documentation-only issues; they affect release safety.

## 5. Login and environment binding

Use one of the following before deployment:

```bash
npx mcporter call cloudbase.auth action=start_auth authMode=device --output json
npx mcporter call cloudbase.auth action=set_env envId=cloud1-9gywyqe49638e46f --output json
npx mcporter call cloudbase.auth action=status --output json
```

If MCP auth is not ready, fall back to CloudBase CLI:

```bash
cloudbase login
cloudbase env:list
```

Expected environment:

- Env ID: `cloud1-9gywyqe49638e46f`
- Region: `ap-shanghai`

## 6. Deploy sequence

Deploy the changed functions after login:

```bash
cloudbase functions:deploy login --envId cloud1-9gywyqe49638e46f --force
cloudbase functions:deploy user --envId cloud1-9gywyqe49638e46f --force
cloudbase functions:deploy products --envId cloud1-9gywyqe49638e46f --force
cloudbase functions:deploy cart --envId cloud1-9gywyqe49638e46f --force
cloudbase functions:deploy order --envId cloud1-9gywyqe49638e46f --force
cloudbase functions:deploy payment --envId cloud1-9gywyqe49638e46f --force
cloudbase functions:deploy distribution --envId cloud1-9gywyqe49638e46f --force
cloudbase functions:deploy config --envId cloud1-9gywyqe49638e46f --force
cloudbase functions:deploy admin-api --envId cloud1-9gywyqe49638e46f --force
cloudbase functions:deploy order-timeout-cancel --envId cloud1-9gywyqe49638e46f --force
cloudbase functions:deploy commission-deadline-process --envId cloud1-9gywyqe49638e46f --force
cloudbase functions:deploy order-auto-confirm --envId cloud1-9gywyqe49638e46f --force
```

## 7. Domain and routing checks

In CloudBase console, verify:

- `jxalk.wenlan.store/admin/*` routes to admin static hosting
- `jxalk.wenlan.store/admin/api/*` routes to `admin-api` with path passthrough
- `payment` HTTP path is reachable
- WeChat Pay notify URL points to the formal payment HTTP path

Do not use `*.service.tcloudbase.com` as the formal admin-ui public entry.

## 8. Environment checks

For `admin-api`, verify:

- `ADMIN_DATA_SOURCE=cloudbase`
- `ADMIN_CLOUDBASE_ENV_ID=cloud1-9gywyqe49638e46f`
- no accidental MySQL fallback is configured as the formal runtime

For payment, verify formal configuration through env or secure cert files rather than repo-tracked secrets.

## 9. Collection and import checks

Before formal release:

- confirm required collections exist in CloudBase
- confirm import packages in `cloudbase-import/` are the expected baseline
- confirm `cloudbase-seed/` and `cloudbase-import/` are not mistaken for live runtime state

## 10. Smoke checklist

After deployment:

1. mini program login returns valid identity
2. product list and detail load
3. order creation works
4. prepay and payment callback work without duplicate post-processing
5. refund review and settlement paths behave correctly
6. admin pages open without routing or permission regression
7. materials upload returns a valid storage reference rather than 413 or route failure
8. route audit and build evidence are attached to the release record if required
