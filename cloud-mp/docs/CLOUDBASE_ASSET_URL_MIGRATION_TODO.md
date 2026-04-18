# CloudBase Asset Migration TODO

- Generated at: 2026-04-17T14:41:56.884Z
- Environment: cloud1-9gywyqe49638e46f
- Records: 0

## Required Actions

1. Re-upload this asset in the admin material library so a cloud:// file_id is created.
2. Backfill file_id for the related banner/splash record and clear legacy image_url/url fields.
3. Run npm run audit:asset-urls again and verify http_url_without_file_id is zero.

## Records

- none

