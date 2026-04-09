# CloudBase Environment Import Result

Generated at: 2026-04-09T02:55:10.285Z

## Environment

- Env ID: cloud1-9gywyqe49638e46f
- Imported at: PENDING
- Operator: 21963
- Import source: `cloud-mp/cloudbase-import`
- Seed summary source: [cloud-mp/cloudbase-import/_summary.json](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudbase-import\_summary.json)
- Status: VERIFIED

## Package Summary

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

## Validation

- Import counts match _summary.json: YES (15/15)
- Users sample checked: PENDING
- Products sample checked: PENDING
- Orders sample checked: PENDING
- Mini program login smoke test: PENDING
- Product list smoke test: PENDING
- Order list smoke test: PENDING
- Admin login smoke test: PENDING

## Runtime Validation

- Checked at: 2026-04-09T02:54:58.672Z
- Runtime env ID: cloud1-9gywyqe49638e46f
- Required collections match: YES
- Matched required collections: 15/15
- Missing required collections: none
- Functions match local source: YES
- Missing functions: none
- Extra deployed functions: none
- CloudRun services: 0
- Runtime status report: [cloud-mp/docs/CLOUDBASE_ENV_RUNTIME_STATUS.md](C:\Users\21963\WeChatProjects\zz\cloud-mp\docs\CLOUDBASE_ENV_RUNTIME_STATUS.md)

## Runtime Blockers

- none

## Runtime Warnings

- No CloudRun services deployed for the admin chain.


## Rollback Baseline

- Legacy JSONL retained: YES
- cloudbase-seed retained: YES
- runtime overrides retained: YES

## Follow-up

- Switch backend read priority to CloudBase
- Switch mini program runtime to CloudBase collections
- Remove temporary compatibility reads
- Start formal payment cutover

## Notes

This file is a draft unless the real target CloudBase import has been executed and the validation fields have been completed.
