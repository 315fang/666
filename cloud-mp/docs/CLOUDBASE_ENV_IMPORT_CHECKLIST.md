# CloudBase Env Import Checklist

## 导入前

- 确认环境 ID 与 [project.config.json](C:\Users\21963\WeChatProjects\zz\cloud-mp\project.config.json) 中 `cloudbaseEnv` 一致
- 确认已生成：
  - [cloudbase-seed](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudbase-seed)
  - [cloudbase-import](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudbase-import)
- 执行 `npm run check:foundation`
- 执行 `npm run import:ready`
- 执行 `npm run import:validate`
- 如需生成记录草稿，执行 `npm run import:report`
- 一键预检可执行 `npm run import:prep`

## 目标集合

- `users`
- `products`
- `skus`
- `categories`
- `cart_items`
- `orders`
- `refunds`
- `reviews`
- `commissions`
- `withdrawals`
- `banners`
- `materials`
- `material_groups`
- `admins`
- `admin_roles`
- `configs` 目前不在导入包中，若目标环境需要统一配置集合，后续应单独补入并同步更新导入包和结果记录

## 导入后检查

- 每个集合记录数与 [cloudbase-import/_summary.json](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudbase-import\_summary.json) 对齐
- 随机抽样检查：
  - `users.openid`
  - `products._id/name/min_price`
  - `skus.product_id/price`
  - `orders.order_no/items`
  - `materials.file_id/temp_url`
- 导入完成后更新迁移记录文档，写明：
  - 导入时间
  - 环境 ID
  - 导入集合
  - 各集合数量
  - 记录文件可由 `npm run import:report` 生成并手工补全

## 回滚原则

- 不删除 `mysql/jsonl`
- 不删除 `cloudbase-seed`
- 不删除 `cloudbase-import`
- 若正式环境导入异常，以 seed 和旧 JSONL 作为回滚基线
