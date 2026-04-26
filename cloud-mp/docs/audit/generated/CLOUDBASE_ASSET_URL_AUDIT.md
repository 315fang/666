# CloudBase Asset URL Audit

- Generated at: 2026-04-25T14:51:39.582Z
- Environment: cloud1-9gywyqe49638e46f
- Auth status: READY
- Env status: READY

## Summary

- Checked targets: 7
- Checked records: 390
- Risky records: 0

## Risk Breakdown

- healthy: 390
- stale_url_but_recoverable: 0
- cloud_asset_without_file_id: 0
- signed_url_without_file_id: 0
- http_url_without_file_id: 0
- missing_asset_ref: 0

## Target Details

### banners

- Total: 3
- Healthy: 3
- stale_url_but_recoverable: 0
- cloud_asset_without_file_id: 0
- signed_url_without_file_id: 0
- http_url_without_file_id: 0
- missing_asset_ref: 0

### splash_screens

- Total: 1
- Healthy: 1
- stale_url_but_recoverable: 0
- cloud_asset_without_file_id: 0
- signed_url_without_file_id: 0
- http_url_without_file_id: 0
- missing_asset_ref: 0

### materials

- Total: 200
- Healthy: 200
- stale_url_but_recoverable: 0
- cloud_asset_without_file_id: 0
- signed_url_without_file_id: 0
- http_url_without_file_id: 0
- missing_asset_ref: 0

### products

- Total: 179
- Healthy: 179
- stale_url_but_recoverable: 0
- cloud_asset_without_file_id: 0
- signed_url_without_file_id: 0
- http_url_without_file_id: 0
- missing_asset_ref: 0

### admin_singletons.settings.homepage

- Total: 4
- Healthy: 4
- stale_url_but_recoverable: 0
- cloud_asset_without_file_id: 0
- signed_url_without_file_id: 0
- http_url_without_file_id: 0
- missing_asset_ref: 0

### admin_singletons.popup-ad-config

- Total: 1
- Healthy: 1
- stale_url_but_recoverable: 0
- cloud_asset_without_file_id: 0
- signed_url_without_file_id: 0
- http_url_without_file_id: 0
- missing_asset_ref: 0

### admin_singletons.mini-program-config.brand_config

- Total: 2
- Healthy: 2
- stale_url_but_recoverable: 0
- cloud_asset_without_file_id: 0
- signed_url_without_file_id: 0
- http_url_without_file_id: 0
- missing_asset_ref: 0

## Top Risk Samples

- none

## Recommended Actions

1. 优先修复 `signed_url_without_file_id`：这些记录过期后会直接 403 且无法自动续签。
2. 清理 `http_url_without_file_id`：迁移到素材库上传，保存 cloud:// file_id。
3. 对 `stale_url_but_recoverable` 可批量清空 image_url/url，仅保留 file_id（读取链路会动态续签）。
4. 对 `cloud_asset_without_file_id` 可批量回填 file_id，并清理重复 URL 字段。
5. `missing_asset_ref` 记录需补图或下线，避免前端空白位。
