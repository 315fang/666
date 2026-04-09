# CloudBase Environment Import Readiness

Generated at: 2026-04-08T06:56:34.760Z

## Environment

- Project env: cloud1-9gywyqe49638e46f
- Input env: not provided
- Operator: 21963

## Checks

- [x] project.config.json: C:\Users\21963\WeChatProjects\zz\cloud-mp\project.config.json
- [x] _summary.json: C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudbase-seed\_summary.json
- [x] _summary.json: C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudbase-import\_summary.json
- [x] CLOUDBASE_ENV_IMPORT_CHECKLIST.md: C:\Users\21963\WeChatProjects\zz\cloud-mp\docs\CLOUDBASE_ENV_IMPORT_CHECKLIST.md
- [x] CLOUDBASE_ENV_IMPORT_RESULT_TEMPLATE.md: C:\Users\21963\WeChatProjects\zz\cloud-mp\docs\CLOUDBASE_ENV_IMPORT_RESULT_TEMPLATE.md
- [x] CLOUDBASE_MIGRATION_PROGRESS.md: C:\Users\21963\WeChatProjects\zz\cloud-mp\docs\CLOUDBASE_MIGRATION_PROGRESS.md
- [x] CLOUDBASE_MIGRATION_BACKLOG.md: C:\Users\21963\WeChatProjects\zz\cloud-mp\docs\CLOUDBASE_MIGRATION_BACKLOG.md
- [x] cloudbase env matches: no override env provided
- [x] project cloudbaseEnv configured: cloud1-9gywyqe49638e46f
- [x] required collections present: all required collections present
- [x] import package exists: C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudbase-import
- [x] seed package exists: C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudbase-seed

## Required Collections

- `users`
- `products`
- `skus`
- `categories`
- `cart_items`
- `orders`
- `refunds`
- `reviews`
- `commissions`
- `withdrawals`
- `banners`
- `materials`
- `material_groups`
- `admins`
- `admin_roles`

## Optional Collections

- `configs`

## Import Package Summary

- `admin_roles`: 2
- `admins`: 2
- `banners`: 5
- `cart_items`: 25
- `categories`: 9
- `commissions`: 3
- `material_groups`: 1
- `materials`: 52
- `orders`: 59
- `products`: 11
- `refunds`: 9
- `reviews`: 3
- `skus`: 11
- `users`: 167
- `withdrawals`: 3

## Warnings

- optional collections not prepared: configs
- no CLOUDBASE_ENV_ID provided; env matching check is informational only

## Result

- Ready for formal CloudBase import: YES
- Notes: This report validates the local import package and preparatory files only. It does not claim the target CloudBase environment has already been imported.
