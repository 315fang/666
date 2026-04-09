# CloudBase Environment Import Result Template

Use this after importing [cloud-mp/cloudbase-import](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudbase-import) into the target CloudBase environment.

You can prefill a draft with `npm run import:report`. The draft will stay explicit about which checks are still pending until real CloudBase values are filled in.

## Environment

- Env ID:
- Imported at:
- Operator:
- Import source: `cloud-mp/cloudbase-import`
- Seed summary source: [cloud-mp/cloudbase-import/_summary.json](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudbase-import\_summary.json)

## Collections

- `users`:
- `products`:
- `skus`:
- `categories`:
- `cart_items`:
- `orders`:
- `refunds`:
- `reviews`:
- `commissions`:
- `withdrawals`:
- `configs`:
- `banners`:
- `materials`:
- `material_groups`:
- `admins`:
- `admin_roles`:

## Validation

- Import counts match `_summary.json`:
- Users sample checked:
- Products sample checked:
- Orders sample checked:
- Mini program login smoke test:
- Product list smoke test:
- Order list smoke test:
- Admin login smoke test:

## Rollback Baseline

- Legacy JSONL retained:
- `cloudbase-seed` retained:
- Runtime overrides retained:
- Notes:

## Follow-up

- Switch backend read priority to CloudBase:
- Switch mini program runtime to CloudBase collections:
- Remove temporary compatibility reads:
- Start formal payment cutover:
