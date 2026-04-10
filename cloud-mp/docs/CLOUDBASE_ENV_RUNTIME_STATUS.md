# CloudBase Environment Runtime Status

Generated at: 2026-04-09T08:43:20.845Z

## Environment

- Env ID: missing
- Auth status: REQUIRED
- Env status: NONE

## Required Collections

- `users`: expected=167, actual=missing, status=missing_collection
- `products`: expected=11, actual=missing, status=missing_collection
- `skus`: expected=11, actual=missing, status=missing_collection
- `categories`: expected=9, actual=missing, status=missing_collection
- `cart_items`: expected=25, actual=missing, status=missing_collection
- `orders`: expected=59, actual=missing, status=missing_collection
- `refunds`: expected=9, actual=missing, status=missing_collection
- `reviews`: expected=3, actual=missing, status=missing_collection
- `commissions`: expected=3, actual=missing, status=missing_collection
- `withdrawals`: expected=3, actual=missing, status=missing_collection
- `banners`: expected=5, actual=missing, status=missing_collection
- `materials`: expected=52, actual=missing, status=missing_collection
- `material_groups`: expected=1, actual=missing, status=missing_collection
- `admins`: expected=2, actual=missing, status=missing_collection
- `admin_roles`: expected=2, actual=missing, status=missing_collection

## Functions

- Local function count: 9
- Deployed function count: 0
- Function names match: NO

- `admin-api`: deployed=no
- `cart`: deployed=no
- `config`: deployed=no
- `distribution`: deployed=no
- `login`: deployed=no
- `order`: deployed=no
- `payment`: deployed=no
- `products`: deployed=no
- `user`: deployed=no

## Admin Chain

- Mode: missing
- Ready: NO
- Evidence: No CloudRun service or deployed admin-api cloud function was found for the admin chain.

## CloudRun

- Service count: 0
- Services: none

## Summary

- Required collection counts match import package: NO
- Matched required collections: 0/15
- Runtime ready: NO

## Blockers

- CloudBase auth/env not ready: auth=REQUIRED, env=NONE
- Required collections missing or mismatched: users, products, skus, categories, cart_items, orders, refunds, reviews, commissions, withdrawals, banners, materials, material_groups, admins, admin_roles
- Cloud functions not deployed from local source: admin-api, cart, config, distribution, login, order, payment, products, user
- No CloudRun service or deployed admin-api cloud function was found for the admin chain.

## Warnings

- none
