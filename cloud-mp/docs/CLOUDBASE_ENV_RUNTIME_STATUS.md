# CloudBase Environment Runtime Status

Generated at: 2026-04-19T15:06:03.898Z

## Environment

- Env ID: cloud1-9gywyqe49638e46f
- Auth status: READY
- Env status: READY

## Required Collections

- `users`: expected=167, actual=missing, status=missing_collection
- `products`: expected=11, actual=11, status=ok
- `skus`: expected=11, actual=missing, status=missing_collection
- `categories`: expected=9, actual=9, status=ok
- `cart_items`: expected=25, actual=51, status=count_above_seed
- `orders`: expected=59, actual=180, status=count_above_seed
- `refunds`: expected=9, actual=32, status=count_above_seed
- `reviews`: expected=3, actual=missing, status=missing_collection
- `commissions`: expected=3, actual=8, status=count_above_seed
- `withdrawals`: expected=3, actual=missing, status=missing_collection
- `banners`: expected=5, actual=5, status=ok
- `materials`: expected=52, actual=62, status=count_above_seed
- `material_groups`: expected=1, actual=1, status=ok
- `admins`: expected=8, actual=8, status=ok
- `admin_roles`: expected=8, actual=8, status=ok

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

- Required collection baseline met: NO
- Required collections at or above baseline: 11/15
- Runtime ready: NO

## Blockers

- Required collections missing or below import baseline: users, skus, reviews, withdrawals

## Warnings

- Required collections contain runtime data beyond import baseline: cart_items, orders, refunds, commissions, materials
- Extra deployed functions not found in local cloudfunctions/: shared
