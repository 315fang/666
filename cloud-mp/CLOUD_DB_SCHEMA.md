# 云数据库集合定义

> 在微信开发者工具 → 云开发控制台 → 数据库 中逐一新建以下集合，并设置权限。

---

## 权限规则说明

| 权限模式 | 说明 |
|---------|------|
| 仅创建者可读写 | 用户只能读写自己的数据（默认） |
| 所有人可读 | 商品、分类等公开数据 |
| 仅管理员可写 | 只有云函数和管理员可写 |

---

## 集合清单

### 1. `users` — 用户表
**权限**：仅创建者可读写（通过云函数读写所有用户）

```json
{
  "_id": "自动生成",
  "openid": "oXXXX",
  "appid": "wx1b40a6e80f4326ab",
  "unionid": "",
  "nickName": "用户昵称",
  "avatarUrl": "https://...",
  "phone": "",
  "gender": 0,
  "level": 0,
  "level_name": "普通会员",
  "points": 0,
  "wallet_balance": 0,
  "is_distributor": false,
  "distributor_level": 0,
  "invite_code": "",
  "my_invite_code": "ABCD1234",
  "referrer_openid": "",
  "register_coupons_issued": 0,
  "created_at": "ServerDate",
  "updated_at": "ServerDate"
}
```

**索引**（必建）：
- `openid` — 唯一索引
- `my_invite_code` — 唯一索引
- `referrer_openid` — 普通索引

---

### 2. `products` — 商品表
**权限**：所有人可读，仅管理员可写

```json
{
  "_id": "自动生成",
  "name": "商品名称",
  "description": "商品描述",
  "images": ["cloud://env.xxx/products/img1.jpg"],
  "category_id": "分类ID",
  "status": "on_sale",
  "min_price": 9900,
  "original_price": 12000,
  "sales_count": 0,
  "sort_order": 0,
  "tags": [],
  "created_at": "ServerDate",
  "updated_at": "ServerDate"
}
```

**索引**：`status + sort_order`、`category_id`、`name`（用于搜索）

---

### 3. `skus` — 商品规格表
**权限**：所有人可读，仅管理员可写

```json
{
  "_id": "自动生成",
  "product_id": "商品ID",
  "name": "500g装",
  "spec": "规格描述",
  "image": "cloud://...",
  "price": 9900,
  "original_price": 12000,
  "stock": 100,
  "sku_code": "",
  "sort_order": 0
}
```

**索引**：`product_id`

---

### 4. `categories` — 分类表
**权限**：所有人可读，仅管理员可写

```json
{
  "_id": "自动生成",
  "name": "茶叶",
  "image": "cloud://...",
  "parent_id": "",
  "level": 1,
  "status": 1,
  "sort_order": 0
}
```

---

### 5. `cart_items` — 购物车
**权限**：仅创建者可读写

```json
{
  "_id": "自动生成",
  "openid": "oXXXX",
  "sku_id": "SKU ID",
  "product_id": "商品ID",
  "qty": 1,
  "snapshot_price": 9900,
  "snapshot_name": "500g装",
  "snapshot_spec": "规格",
  "snapshot_image": "cloud://...",
  "created_at": "ServerDate",
  "updated_at": "ServerDate"
}
```

**索引**：`openid`、`openid + sku_id`

---

### 6. `orders` — 订单表
**权限**：仅创建者可读，仅管理员可写

```json
{
  "_id": "自动生成",
  "openid": "oXXXX",
  "order_no": "WL20260407123456789",
  "status": "pending_payment",
  "total_amount": 9900,
  "pay_amount": 9900,
  "address_id": "地址ID",
  "remark": "",
  "coupon_id": "",
  "items": [
    {
      "sku_id": "SKU ID",
      "product_id": "商品ID",
      "qty": 1,
      "unit_price": 9900,
      "item_amount": 9900,
      "snapshot_name": "500g装",
      "snapshot_spec": "",
      "snapshot_image": "cloud://..."
    }
  ],
  "transaction_id": "",
  "paid_at": null,
  "shipped_at": null,
  "delivered_at": null,
  "confirmed_at": null,
  "closed_at": null,
  "cancel_reason": "",
  "reviewed": false,
  "created_at": "ServerDate",
  "updated_at": "ServerDate"
}
```

**状态枚举**：
- `pending_payment` 待付款
- `pending_ship` 待发货
- `shipped` 已发货
- `completed` 已完成
- `cancelled` 已取消
- `refund_applying` 退款中

**索引**：`openid`、`order_no`（唯一）、`status`、`openid + status`

---

### 7. `refunds` — 退款申请
**权限**：仅创建者可读，仅管理员可写

```json
{
  "_id": "自动生成",
  "openid": "oXXXX",
  "order_id": "订单ID",
  "order_no": "WL...",
  "amount": 9900,
  "reason": "退款原因",
  "images": ["cloud://..."],
  "status": "pending",
  "created_at": "ServerDate",
  "updated_at": "ServerDate"
}
```

---

### 8. `commissions` — 佣金记录
**权限**：仅管理员可读写（云函数操作）

```json
{
  "_id": "自动生成",
  "order_id": "订单ID",
  "order_no": "WL...",
  "from_openid": "买家openid",
  "to_openid": "收佣方openid",
  "amount": 495,
  "rate": 0.05,
  "status": "pending",
  "level": 1,
  "created_at": "ServerDate",
  "updated_at": "ServerDate"
}
```

**状态**：`pending` → `settled`（确认收货后）

---

### 9. `withdrawals` — 提现申请
**权限**：仅管理员可读写

```json
{
  "_id": "自动生成",
  "openid": "oXXXX",
  "amount": 5000,
  "account_type": "wechat",
  "account_no": "",
  "status": "pending",
  "created_at": "ServerDate",
  "updated_at": "ServerDate"
}
```

---

### 10. `reviews` — 商品评价
**权限**：仅创建者可读写

```json
{
  "_id": "自动生成",
  "openid": "oXXXX",
  "order_id": "订单ID",
  "rating": 5,
  "content": "评价内容",
  "images": ["cloud://..."],
  "product_ids": ["商品ID"],
  "created_at": "ServerDate"
}
```

---

### 11. `configs` — 通用配置（首页/主题/小程序配置）
**权限**：所有人可读，仅管理员可写

```json
{
  "_id": "自动生成",
  "type": "mini_program_config",
  "active": true,
  "value": { "brand_config": { ... }, "feature_flags": { ... } },
  "updated_at": "ServerDate"
}
```

**type 枚举**：`mini_program_config`、`home_content`、`theme`、`splash`

---

## 创建步骤

1. 微信开发者工具 → 点击右上角「云开发」按钮
2. 选择「数据库」→ 点击「+」新建集合
3. 按上表依次创建所有集合
4. 点击每个集合 → 「权限设置」→ 按上表配置

> **提示**：索引可在集合内 「索引管理」→「添加索引」中配置
