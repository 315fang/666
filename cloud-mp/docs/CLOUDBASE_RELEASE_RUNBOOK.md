# CloudBase Release Runbook

> Updated: 2026-04-10

This runbook closes the gap between local P0 readiness and CloudBase console deployment.

## Current Local Status

- `npm run release:check` passes with `P0 blockers: 0` and `Warnings: 0`.
- `admin-ui` production build passes.
- CloudBase MCP is configured in `config/mcporter.json`, but MCP auth may still report `AUTH_REQUIRED`.
- CloudBase CLI login is working on this machine and was used for deployment.

## Login And Bind Environment

Use one of these paths before deployment:

```bash
npx mcporter call cloudbase.auth action=start_auth authMode=device --output json
npx mcporter call cloudbase.auth action=set_env envId=cloud1-9gywyqe49638e46f --output json
npx mcporter call cloudbase.auth action=status --output json
```

If MCP device login keeps timing out, use CloudBase CLI login:

```bash
cloudbase login
cloudbase env:list
```

Expected environment:

- Env ID: `cloud1-9gywyqe49638e46f`
- Region: `ap-shanghai`

## Deploy Cloud Functions

Deploy or update these functions after login. The latest deployment completed for the changed functions on 2026-04-10:

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

The three timer functions must retain package trigger config. Current cloud trigger check:

- `order-timeout-cancel`: every 5 minutes, trigger `orderTimeoutCancelTimer`
- `commission-deadline-process`: every hour at minute 15, trigger `commissionDeadlineProcessTimer`
- `order-auto-confirm`: every hour at minute 30, trigger `orderAutoConfirmTimer`

## Manual Console Checks

In CloudBase console:

- Confirm `payment` has HTTP access path `/payment`.
- Confirm WeChat Pay notify URL points to the payment HTTP access URL.
- Confirm payment private key/public key/API v3 key are configured through secure env/config, not copied into public code.
- Confirm `admin-api` runtime env has `ADMIN_DATA_SOURCE=cloudbase` and `ADMIN_CLOUDBASE_ENV_ID=cloud1-9gywyqe49638e46f`.
- Confirm `admin-api` `/health` eventually reports no CloudBase collection warnings after a cold start. A warm instance may keep startup warning counters until recycled.
- Confirm the 22 import collections exist or can be imported from `cloudbase-import`.

## Required Collections

Core import validation currently expects these 22 collections:

- `admins`
- `admin_roles`
- `banners`
- `cart_items`
- `categories`
- `commissions`
- `coupon_auto_rules`
- `content_boards`
- `content_board_products`
- `agent_exit_applications`
- `dividend_executions`
- `materials`
- `material_groups`
- `orders`
- `products`
- `refunds`
- `reviews`
- `skus`
- `splash_screens`
- `station_staff`
- `users`
- `withdrawals`

## Suggested Indexes

Create these indexes before production traffic. These ordinary indexes have been created via CLI; use the console to verify them:

- `users`: `openid`, `my_invite_code`, `referrer_openid`
- `orders`: `openid`, `order_no`, `status`, `openid + status`
- `cart_items`: `openid`, `openid + sku_id`
- `commissions`: `openid`, `order_id`, `status`, `refund_deadline`
- `refunds`: `openid`, `order_id`, `status`
- `user_coupons`: `openid`, `coupon_id`, `status`
- `content_board_products`: `board_id`, `board_id + product_id`
- `station_staff`: `station_id`, `station_id + user_id`

## Smoke Test

After deployment:

1. Mini program login returns an `openid`.
2. Product list and detail load.
3. Create an order with cart items and coupon/points disabled.
4. Trigger payment prepay and simulate or complete payment callback.
5. Confirm repeated callback does not duplicate stock deduction, points, or commissions.
6. Admin UI opens products, orders, refunds, commissions, coupons, group-buys, activities, featured-board, pickup-stations, and agent-system pages without 404.
7. Reject a refund and verify commissions return from `frozen` to `pending`.
8. Complete a refund and verify commissions become `cancelled`.
9. Run `commission-deadline-process` manually once and verify due `frozen` commissions become `pending_approval`.
10. Run `order-auto-confirm` manually once with a test shipped order and verify it becomes `completed`.
