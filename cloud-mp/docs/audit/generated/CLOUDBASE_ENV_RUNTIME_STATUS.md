# CloudBase Environment Runtime Status

Generated at: 2026-04-25T03:09:59.593Z

## Environment

- Env ID: cloud1-9gywyqe49638e46f
- Auth status: READY
- Env status: READY

## Required Collections

- `users`: expected=167, actual=213, status=count_above_seed, structure=not_listed_direct_read_ok
- `products`: expected=11, actual=20, status=count_above_seed
- `skus`: expected=11, actual=11, status=ok, structure=not_listed_direct_read_ok
- `categories`: expected=9, actual=8, status=count_below_expected
- `cart_items`: expected=25, actual=73, status=count_above_seed
- `orders`: expected=59, actual=193, status=count_above_seed
- `refunds`: expected=9, actual=34, status=count_above_seed, structure=not_listed_direct_read_ok
- `reviews`: expected=3, actual=5, status=count_above_seed, structure=not_listed_direct_read_ok
- `commissions`: expected=3, actual=10, status=count_above_seed
- `withdrawals`: expected=3, actual=6, status=count_above_seed, structure=not_listed_direct_read_ok
- `banners`: expected=5, actual=5, status=ok
- `materials`: expected=52, actual=195, status=count_above_seed
- `material_groups`: expected=1, actual=1, status=ok
- `admins`: expected=9, actual=15, status=count_above_seed
- `admin_roles`: expected=8, actual=8, status=ok

## Functions

- Local function count: 13
- Deployed function count: 14
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
- `visitor-account-cleanup`: deployed=yes

## Admin Chain

- Mode: function_gateway
- Ready: YES
- Evidence: Admin chain currently resolves through the deployed admin-api cloud function gateway.

## CloudRun

- Service count: 0
- Services: none

## Summary

- Required collection baseline met: NO
- Required collections readable: YES (15/15)
- Runtime ready: YES

## Blockers

- none

## Warnings

- Required collections are below mutable import baseline: categories
- Required collections contain runtime data beyond import baseline: users, products, cart_items, orders, refunds, reviews, commissions, withdrawals, materials, admins
- Required collection structure list differs from direct reads: users(not_listed_direct_read_ok), skus(not_listed_direct_read_ok), refunds(not_listed_direct_read_ok), reviews(not_listed_direct_read_ok), withdrawals(not_listed_direct_read_ok)
- Extra deployed functions not found in local cloudfunctions/: shared
