# CloudBase Asset Migration TODO

- Generated at: 2026-04-19T03:16:42.075Z
- Environment: cloud1-9gywyqe49638e46f
- Records: 1

## Required Actions

1. Re-upload this asset in the admin material library so a cloud:// file_id is created.
2. Backfill file_id for the related record and clear legacy image_url/url fields.
3. Run npm run audit:asset-urls again and verify signed/http temporary risks are zero.

## Records

- [admin_singletons.popup-ad-config:value.image_url] id=popup-ad-config | untitled | https://oss-1357612648.cos.ap-shanghai.myqcloud.com/products/1773442002338_e2c0135b1b16e32e.jpg

