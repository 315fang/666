# CloudBase Asset URL Audit

- Generated at: 2026-04-17T14:55:09.509Z
- Environment: cloud1-9gywyqe49638e46f
- Auth status: READY
- Env status: READY

## Summary

- Checked collections: 3
- Checked records: 65
- Risky records: 0

## Risk Breakdown

- stale_url_but_recoverable: 0
- cloud_asset_without_file_id: 0
- signed_url_without_file_id: 0
- http_url_without_file_id: 0
- missing_asset_ref: 0

## Collection Details

### banners

- Total: 5
- Healthy: 5
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

- Total: 59
- Healthy: 59
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
4. `missing_asset_ref` 记录需补图或下线，避免前端空白位。
