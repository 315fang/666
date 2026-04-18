# CloudBase Environment Runtime Status

Generated at: 2026-04-17T12:29:12.081Z

## Environment

- Env ID: cloud1-9gywyqe49638e46f
- Auth status: READY
- Env status: READY

## Required Collections

- `users`: expected=167, actual=185, status=count_above_seed
- `products`: expected=11, actual=11, status=ok
- `skus`: expected=11, actual=11, status=ok
- `categories`: expected=9, actual=9, status=ok
- `cart_items`: expected=25, actual=50, status=count_above_seed
- `orders`: expected=59, actual=169, status=count_above_seed
- `refunds`: expected=9, actual=32, status=count_above_seed
- `reviews`: expected=3, actual=3, status=ok
- `commissions`: expected=3, actual=7, status=count_above_seed
- `withdrawals`: expected=3, actual=5, status=count_above_seed
- `banners`: expected=5, actual=5, status=ok
- `materials`: expected=52, actual=59, status=count_above_seed
- `material_groups`: expected=1, actual=1, status=ok
- `admins`: expected=2, actual=2, status=ok
- `admin_roles`: expected=2, actual=2, status=ok

## Functions

- Local function count: 12
- Deployed function count: 13
- Function names match: NO

- `admin-api`: deployed=yes
- `cart`: deployed=yes
- `commission-deadline-process`: deployed=yes
- `config`: deployed=yes
- `distribution`: deployed=yes
- `login`: deployed=yes
- `order`: deployed=yes
- `order-auto-confirm`: deployed=yes
- `order-timeout-cancel`: deployed=yes
- `payment`: deployed=yes
- `products`: deployed=yes
- `user`: deployed=yes

## Admin Chain

- Mode: function_gateway
- Ready: YES
- Evidence: Admin chain currently resolves through the deployed admin-api cloud function gateway.

## CloudRun

- Service count: 0
- Services: none

## Summary

- Required collection baseline met: YES
- Required collections at or above baseline: 15/15
- Runtime ready: YES

## Blockers

- none

## Warnings

- Required collections contain runtime data beyond import baseline: users, cart_items, orders, refunds, commissions, withdrawals, materials
- Extra deployed functions not found in local cloudfunctions/: shared
