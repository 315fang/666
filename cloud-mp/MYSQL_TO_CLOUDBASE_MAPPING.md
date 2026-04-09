# MySQL To CloudBase Mapping

## 迁移原则

- 旧 MySQL 表是迁移输入，不是运行时标准。
- 新代码只认 CloudBase 目标字段。
- 兼容逻辑只允许出现在迁移脚本或临时适配层。

## 核心映射

### users

| MySQL 字段 | CloudBase 字段 | 说明 |
| --- | --- | --- |
| `id` | `_legacy_id` | 仅迁移留档，不作为运行时主键 |
| `openid` | `openid` | 正式唯一标识 |
| `nickname` | `nickName` | 前台展示名 |
| `avatar_url` | `avatarUrl` | 用户头像 |
| `phone` | `phone` | 手机号 |
| `parent_id` | `referrer_openid` | 迁移时需二次换算 |

### products

| MySQL 字段 | CloudBase 字段 | 说明 |
| --- | --- | --- |
| `id` | `_legacy_id` | 迁移留档 |
| `name` | `name` | 商品名 |
| `description` | `description` | 商品描述 |
| `images` | `images` | 长期应改存 `file_id` 引用 |
| `detail_images` | `detail_images` | 详情图 |
| `category_id` | `category_id` | 分类引用 |
| `retail_price` | `min_price` | 长期目标单位为分 |
| `market_price` | `original_price` | 长期目标单位为分 |
| `status` | `status` | 建议统一枚举 |

### skus

| MySQL 字段 | CloudBase 字段 | 说明 |
| --- | --- | --- |
| `product_skus.*` | `skus.*` | 不再保留旧集合名 |
| `price` | `price` | 金额单位长期统一为分 |
| `stock` | `stock` | 库存 |
| `image` | `image` | 长期改为素材引用 |

### cart_items

| MySQL 字段 | CloudBase 字段 | 说明 |
| --- | --- | --- |
| `user_id` / `buyer_id` | `openid` | 归属统一 |
| `quantity` | `qty` | 数量字段统一 |
| `product_id` | `product_id` | 商品引用 |
| `sku_id` | `sku_id` | SKU 引用 |

### orders

| MySQL 字段 | CloudBase 字段 | 说明 |
| --- | --- | --- |
| `buyer_id` | `openid` | 需通过用户映射转换 |
| `order_no` | `order_no` | 唯一索引 |
| `status` | `status` | 建议统一为 CloudBase 状态枚举 |
| `quantity` | `items[].qty` | 改为明细快照 |
| `actual_price` | `pay_amount` | 长期目标单位为分 |
| `address_snapshot` | `address_snapshot` | 可直接复用对象快照 |

### materials

| MySQL 字段 | CloudBase 字段 | 说明 |
| --- | --- | --- |
| `url` | `file_id` + `temp_url` | 长期只保留 `file_id` 为主 |
| `group_id` | `group_id` | 分组引用 |
| `title` | `name` | 可按后台展示层兼容 |
| `type` | `usage_type` | 图片/海报/视频等 |

## 明确淘汰的旧字段

- `buyer_id`
- `user_id`
- `product_skus`
- `quantity`
- `avatar_url`
- `nickname`

## 迁移截止要求

- 新增云函数不得再写入以上旧字段
- 新增后台接口不得再返回旧字段作为主字段
- 旧字段只允许保留到全量迁移脚本完成
