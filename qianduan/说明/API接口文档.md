# 臻选小程序 · 后端接口文档

> **版本**：2.0.0  
> **最后更新**：2026-03-01  
> **前端项目**：`qianduan/`  
> **生产 API 地址**：`https://api.jxalk.cn/api`  
> **开发 API 地址**：`http://192.168.1.4:3000/api`

---

## 目录

1. [通用规范](#1-通用规范)
2. [认证鉴权](#2-认证鉴权)
3. [可视化内容配置接口（重点）](#3-可视化内容配置接口重点)
   - 3.1 [首页配置 `/homepage-config`](#31-首页配置-get-homepage-config)
   - 3.2 [活动页配置 `/activity-config`](#32-活动页配置-get-activity-config)
   - 3.3 [商品分类 `/products/categories`](#33-商品分类列表-get-productscategories)
4. [用户与认证](#4-用户与认证)
5. [商品](#5-商品)
6. [购物车](#6-购物车)
7. [订单](#7-订单)
8. [退款售后](#8-退款售后)
9. [积分系统](#9-积分系统)
10. [分销体系](#10-分销体系)
11. [钱包与提现](#11-钱包与提现)
12. [活动玩法](#12-活动玩法)
13. [用户功能](#13-用户功能)
14. [其他接口](#14-其他接口)

---

## 1. 通用规范

### 基础 URL

```
生产：https://api.jxalk.cn/api
开发：http://192.168.1.4:3000/api
```

### 请求头

| 请求头 | 说明 | 示例 |
|--------|------|------|
| `Authorization` | Bearer Token | `Bearer eyJhbGci...` |
| `x-openid` | 微信 openid | `oXxxx...` |
| `Content-Type` | 请求体类型 | `application/json` |

### 统一响应格式

```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | number | `0` = 成功，其他值 = 失败 |
| `message` | string | 操作描述 |
| `data` | any | 响应数据 |

### 分页响应结构

```json
{
  "code": 0,
  "data": {
    "list": [ ... ],
    "pagination": {
      "total": 100,
      "page": 1,
      "limit": 20
    }
  }
}
```

---

## 2. 认证鉴权

### `POST /login`

微信一键登录，使用微信临时 code 换取系统 token。

**请求体**

```json
{
  "code": "wx_temp_code_from_wx.login()",
  "invite_code": "optional_invite_code"
}
```

**响应**

```json
{
  "code": 0,
  "data": {
    "token": "eyJhbGci...",
    "openid": "oXxxx...",
    "user": {
      "id": 1,
      "nickname": "用户昵称",
      "avatar_url": "https://...",
      "role": 0,
      "role_name": "普通用户",
      "role_level": 0
    }
  }
}
```

---

## 3. 可视化内容配置接口（重点）

> **说明**：以下三个接口控制小程序中所有可视化展示内容，包括首页、活动页的图片、文案、图标、跳转链接等。通过后台管理平台修改这些接口的返回数据，即可实时更新小程序前端展示，无需重新发布小程序。

---

### 3.1 首页配置 `GET /homepage-config`

控制**首页所有图片、文案、活动模块**的动态内容。前端会对每个字段进行判空降级（若接口返回为空，则使用内置的 Mock 图展示，不会白屏）。

**响应体结构**

```json
{
  "code": 0,
  "data": {
    "posters": [ ... ],
    "memberPosters": [ ... ],
    "memberBanners": [ ... ],
    "schemePosters": [ ... ],
    "starSections": [ ... ],
    "newArrivals": [ ... ],
    "aboutList": [ ... ],
    "configs": { ... }
  }
}
```

---

#### `data.posters` — 首页主轮播海报

轮播展示在首页顶部，全屏宽幅图。

```json
"posters": [
  "https://cdn.example.com/poster1.jpg",
  "https://cdn.example.com/poster2.jpg"
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| posters | `string[]` | 图片 URL 数组，推荐尺寸 **1000×600px**，支持 JPG/PNG/WebP |

---

#### `data.memberPosters` — 会员专属轮播图

展示在会员权益区域，用于展示会员礼遇、专属折扣等内容。

```json
"memberPosters": [
  "https://cdn.example.com/member1.jpg",
  "https://cdn.example.com/member2.jpg"
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| memberPosters | `string[]` | 图片 URL 数组，推荐尺寸 **800×400px** |

---

#### `data.memberBanners` — 会员价值展示卡片

展示会员等级门槛价值的横向滑动卡片组（每张卡片含图片 + 标签 + 价格）。

```json
"memberBanners": [
  {
    "id": 1,
    "image": "https://cdn.example.com/member-card1.jpg",
    "label": "单笔实付金额",
    "price": "600"
  },
  {
    "id": 2,
    "image": "https://cdn.example.com/member-card2.jpg",
    "label": "尊享会员礼遇",
    "price": "1200"
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 唯一 ID |
| `image` | string | 卡片图片 URL，推荐尺寸 **1000×500px** |
| `label` | string | 标签文案，如"单笔实付金额" |
| `price` | string | 展示价格/门槛值（仅作展示，不参与计算） |

---

#### `data.schemePosters` — 美肤方案海报

竖版方案展示海报（含英文标题、中文标题、按钮文字、图片）。

```json
"schemePosters": [
  {
    "id": 1,
    "en": "PROFESSIONAL SKIN CARE",
    "cn": "选择您的\n专属美肤方案",
    "btn": "舒缓强韧套组",
    "image": "https://cdn.example.com/scheme1.jpg"
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 唯一 ID |
| `en` | string | 英文副标题（全大写） |
| `cn` | string | 中文主标题，支持 `\n` 换行 |
| `btn` | string | 按钮文案 |
| `image` | string | 海报图片 URL，推荐尺寸 **400×600px** |

---

#### `data.starSections` — 星品展示组（多组产品轮播）

首页核心产品展示区，支持多个分组，每组内多个规格可左右切换。

```json
"starSections": [
  {
    "id": "star1",
    "titleEn": "TOP STAR PRODUCTS",
    "titleCn": "TOP 星品挚选",
    "specs": [
      {
        "productId": 101,
        "name": "贵妇膏38g",
        "slogan": "即刻匀净透亮",
        "desc": "1瓶改善 8大肌肤问题",
        "awards": "瑞丽年度\n素颜护肤\n大奖",
        "sales": "2760万+",
        "price": "680",
        "image": "https://cdn.example.com/product1.jpg"
      },
      {
        "productId": 102,
        "name": "贵妇膏5g",
        "slogan": "小巧便携 随时修护",
        "desc": "旅行随行装 随时随地美肌",
        "awards": "人气单品",
        "sales": "500万+",
        "price": "128",
        "image": "https://cdn.example.com/product2.jpg"
      }
    ]
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 分组唯一标识 |
| `titleEn` | string | 英文标题（装饰用） |
| `titleCn` | string | 中文标题 |
| `specs[]` | array | 该分组下的产品规格列表 |
| `specs[].productId` | number | 关联商品 ID（点击跳转到对应商品详情页） |
| `specs[].name` | string | 产品名称 |
| `specs[].slogan` | string | 产品 slogan |
| `specs[].desc` | string | 产品简描 |
| `specs[].awards` | string | 奖项文案，支持 `\n` 换行 |
| `specs[].sales` | string | 销量文案，如 "2760万+" |
| `specs[].price` | string | 展示价格 |
| `specs[].image` | string | 产品图片 URL，推荐尺寸 **800×800px** |

---

#### `data.newArrivals` — 新品推荐列表

首页新品区展示，点击可跳转至商品详情。

```json
"newArrivals": [
  {
    "id": 101,
    "name": "素颜三部曲·精华",
    "price": "680.00",
    "image": "https://cdn.example.com/product-new1.jpg",
    "member_only": true
  },
  {
    "id": 102,
    "name": "奢宠逆龄面霜",
    "price": "1280.00",
    "image": "https://cdn.example.com/product-new2.jpg",
    "member_only": false
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 商品 ID，用于跳转详情页 |
| `name` | string | 商品名称 |
| `price` | string | 展示价格（两位小数） |
| `image` | string | 商品图片 URL，推荐尺寸 **400×400px** |
| `member_only` | boolean | `true` = 显示"会员专属"角标 |

---

#### `data.aboutList` — 品牌故事卡片组

展示在首页底部的品牌介绍区域，支持多张卡片横向滑动。

```json
"aboutList": [
  {
    "id": 1,
    "title": "品牌故事",
    "sub": "BRAND STORY",
    "body": "源于对美的极致追求，镜像商城诞生于对品质生活的向往。"
  },
  {
    "id": 2,
    "title": "关于我们",
    "sub": "ABOUT US",
    "body": "专注甄选全球顶尖原料，每一款产品都经过严苛品控。"
  },
  {
    "id": 3,
    "title": "目标使命",
    "sub": "OUR MISSION",
    "body": "让每一位女性都能遇见属于自己的美，绽放独特光彩。"
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 唯一 ID |
| `title` | string | 中文标题 |
| `sub` | string | 英文副标题（装饰用，全大写） |
| `body` | string | 正文内容 |

---

#### `data.configs` — 首页全局开关配置

控制首页各模块的显隐及通用文案。

```json
"configs": {
  "showSignIn": true,
  "showBubbles": true,
  "brandName": "问兰镜像",
  "welcomeText": "问兰镜像 · 只做好产品",
  "signInBonusText": "每日签到得积分"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `showSignIn` | boolean | 是否展示每日签到按钮 |
| `showBubbles` | boolean | 是否展示用户活动气泡弹窗 |
| `brandName` | string | 品牌名称文案 |
| `welcomeText` | string | 首页欢迎语 |
| `signInBonusText` | string | 签到区域提示文案 |

---

### 3.2 活动页配置 `GET /activity-config`

控制**活动页（Tab 第三栏）的所有展示内容**，包括顶部轮播、快捷入口图标/颜色/文案、卡片海报。

**响应体结构**

```json
{
  "code": 0,
  "data": {
    "banners": [ ... ],
    "quickEntries": [ ... ],
    "cardPosters": [ ... ]
  }
}
```

---

#### `data.banners` — 活动页顶部轮播图

```json
"banners": [
  {
    "id": 1,
    "image": "https://cdn.example.com/activity-banner1.jpg",
    "link": "/pages/group/list"
  },
  {
    "id": 2,
    "image": "https://cdn.example.com/activity-banner2.jpg",
    "link": ""
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 唯一 ID |
| `image` | string | 图片 URL，推荐尺寸 **1000×500px** |
| `link` | string | 点击跳转的小程序页面路径；为空时弹出"活动筹备中" |

---

#### `data.quickEntries` — 快捷入口（4个图标入口）

活动页中部的功能入口图标组，支持自定义图标颜色、名称及跳转路径。

```json
"quickEntries": [
  {
    "id": "group",
    "name": "拼团专区",
    "icon": "/assets/icons/users.svg",
    "color": "#FF4D4F",
    "path": "/pages/group/list"
  },
  {
    "id": "slash",
    "name": "砍一刀",
    "icon": "/assets/icons/tag.svg",
    "color": "#722ED1",
    "path": "/pages/slash/list"
  },
  {
    "id": "lottery",
    "name": "积分抽奖",
    "icon": "/assets/icons/gift.svg",
    "color": "#FAAD14",
    "path": "/pages/lottery/lottery"
  },
  {
    "id": "coupon",
    "name": "领券中心",
    "icon": "/assets/icons/star.svg",
    "color": "#13C2C2",
    "path": "/pages/coupon/list"
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 唯一标识，勿重复 |
| `name` | string | 入口名称文案（最多4字） |
| `icon` | string | 图标路径（小程序本地 SVG）或 CDN URL |
| `color` | string | 图标背景色 Hex 值，如 `#FF4D4F` |
| `path` | string | 点击跳转的小程序页面路径 |

> **当前可用图标路径（本地 assets）**：
> `/assets/icons/users.svg`、`/assets/icons/tag.svg`、`/assets/icons/gift.svg`、`/assets/icons/star.svg`、`/assets/icons/activity.svg`

---

#### `data.cardPosters` — 活动卡片海报

活动页下方的活动卡片轮播，每张卡片含标题、副标题、图片、跳转链接。

```json
"cardPosters": [
  {
    "id": 1,
    "title": "限时秒杀",
    "subTitle": "每天10点开启",
    "image": "https://cdn.example.com/act-poster1.jpg",
    "link": "/pages/activity/flash-sale"
  },
  {
    "id": 2,
    "title": "新品首发",
    "subTitle": "独家新品抢先看",
    "image": "https://cdn.example.com/act-poster2.jpg",
    "link": ""
  }
]
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 唯一 ID |
| `title` | string | 卡片主标题 |
| `subTitle` | string | 卡片副标题 |
| `image` | string | 卡片图片 URL，推荐尺寸 **600×400px** |
| `link` | string | 跳转路径；为空时弹出"活动筹备中" |

---

### 3.3 商品分类列表 `GET /products/categories`

控制**商品页（Tab 第二栏）的左侧分类菜单及右侧商品列表**。目前前端使用 Mock 数据，接入此接口后可从后台管理分类及展示顺序。

**响应体结构**

```json
{
  "code": 0,
  "data": [
    {
      "id": "skincare",
      "name": "护肤正装",
      "sort": 1,
      "products": [
        {
          "id": 301,
          "name": "精华水",
          "description": "深度补水，锁住营养",
          "price": "580.00",
          "image": "https://cdn.example.com/product301.jpg"
        }
      ]
    },
    {
      "id": "makeup",
      "name": "彩妆系列",
      "sort": 2,
      "products": [ ... ]
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 分类唯一标识 |
| `name` | string | 分类名称（左侧菜单展示文字） |
| `sort` | number | 排序权重，越小越靠前 |
| `products[]` | array | 该分类下的商品列表 |
| `products[].id` | number | 商品 ID |
| `products[].name` | string | 商品名称 |
| `products[].description` | string | 商品简描 |
| `products[].price` | string | 展示价格 |
| `products[].image` | string | 商品缩略图 URL，推荐尺寸 **400×400px** |

---

### 3.4 活动气泡动态 `GET /activity/bubbles`

控制首页和活动页底部弹出的"用户动态气泡"，用于营造活跃氛围。

**请求参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `limit` | number | 返回条数，默认 10 |

**响应**

```json
{
  "code": 0,
  "data": [
    {
      "nickname": "用户**23",
      "type": "order",
      "product_name": "贵妇膏38g",
      "created_at": "2026-03-01T10:00:00Z"
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `nickname` | string | 脱敏用户昵称，如 "用户**23" |
| `type` | string | 行为类型：`order`（购买）、`group_buy`（拼团）、`slash`（砍价） |
| `product_name` | string | 商品名称 |
| `created_at` | string | 发生时间（ISO 8601） |

---

## 4. 用户与认证

### `GET /user/profile` — 获取用户信息

**响应**

```json
{
  "code": 0,
  "data": {
    "id": 1,
    "nickname": "昵称",
    "avatar_url": "https://...",
    "role": 0,
    "role_name": "普通用户",
    "role_level": 0,
    "growth_value": 320,
    "next_level_threshold": 500,
    "phone": "138****8888"
  }
}
```

| 字段 | 说明 |
|------|------|
| `role` / `role_level` | 用户角色等级，`0`=普通，`1`=会员，`2`=代理商，`3`=高级代理 |
| `role_name` | 角色名称文案（可由后端控制） |
| `growth_value` | 当前成长值 |
| `next_level_threshold` | 升级所需成长值 |

### `PUT /user/profile` — 更新用户信息

**请求体**

```json
{
  "nickname": "新昵称",
  "avatar_url": "https://cdn.example.com/avatar.jpg"
}
```

### `POST /user/upload` — 上传头像

- `Content-Type`: `multipart/form-data`
- 字段名：`file`

**响应**：`{ "code": 0, "data": { "url": "https://cdn.example.com/avatar.jpg" } }`

---

## 5. 商品

### `GET /products` — 商品列表

**请求参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | number | 页码，默认 1 |
| `limit` | number | 每页数量，默认 20 |
| `category` | string | 分类 ID 筛选 |
| `keyword` | string | 关键词搜索 |

### `GET /products/{id}` — 商品详情

**响应关键字段**

```json
{
  "code": 0,
  "data": {
    "id": 101,
    "name": "贵妇膏38g",
    "price": "680.00",
    "market_price": "880.00",
    "images": ["https://...", "https://..."],
    "detail_images": ["https://..."],
    "description": "...",
    "skus": [
      {
        "id": 1001,
        "name": "38g",
        "retail_price": "680.00",
        "stock": 999
      }
    ],
    "member_only": false
  }
}
```

### `GET /products/{id}/reviews` — 商品评价

**请求参数**：`limit` (number)

---

## 6. 购物车

### `GET /cart` — 获取购物车

**响应关键字段**

```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "id": 1,
        "product_id": 101,
        "quantity": 2,
        "effective_price": "680.00",
        "sku": { "id": 1001, "name": "38g", "retail_price": "680.00" }
      }
    ],
    "summary": {
      "total_amount": "1360.00"
    }
  }
}
```

### `POST /cart` — 加入购物车

```json
{ "product_id": 101, "quantity": 1, "sku_id": 1001 }
```

### `PUT /cart/{id}` — 修改数量

```json
{ "quantity": 3 }
```

### `DELETE /cart/{id}` — 删除商品

---

## 7. 订单

### `GET /orders` — 订单列表

**请求参数**

| 参数 | 类型 | 说明 |
|------|------|------|
| `status` | string | `pending`（待付款）、`paid`（待发货）、`shipped`（已发货）、`completed`、`cancelled` |
| `page` | number | 页码 |
| `limit` | number | 每页数量 |

### `POST /orders` — 创建订单

```json
{
  "address_id": 1,
  "cart_ids": [1, 2, 3],
  "remark": "备注",
  "coupon_id": null
}
```

### `GET /orders/{id}` — 订单详情

### `POST /orders/{id}/prepay` — 发起微信支付

**响应**：返回微信支付所需参数（timeStamp, nonceStr, package, signType, paySign）。

### `POST /orders/{id}/confirm` — 确认收货

### `POST /orders/{id}/cancel` — 取消订单

---

## 8. 退款售后

### `GET /refunds` — 退款列表

**请求参数**：`page`、`limit`

### `GET /refunds/{id}` — 退款详情

### `POST` 申请退款

> 接口路径需与后端确认，建议 `POST /orders/{orderId}/refund`

```json
{
  "reason": "不想要了",
  "images": ["https://cdn.example.com/evidence.jpg"],
  "amount": "680.00"
}
```

### `PUT /refunds/{id}/cancel` — 撤销退款申请

---

## 9. 积分系统

### `GET /points/balance` — 积分余额（简版）

```json
{ "code": 0, "data": { "balance": 320 } }
```

### `GET /points/account` — 积分账户详情

```json
{
  "code": 0,
  "data": {
    "balance_points": 320,
    "total_earned": 1200,
    "total_spent": 880
  }
}
```

### `GET /points/sign-in/status` — 今日签到状态

```json
{ "code": 0, "data": { "signed": false } }
```

### `POST /points/sign-in` — 执行签到

**响应**

```json
{
  "code": 0,
  "data": {
    "points_earned": 10,
    "balance_points": 330
  }
}
```

### `GET /points/tasks` — 积分任务列表

### `GET /points/logs` — 积分流水记录

**请求参数**：`page`、`limit`

---

## 10. 分销体系

### `GET /distribution/overview` — 分销概览（我的页面核心数据）

**响应关键结构**

```json
{
  "code": 0,
  "data": {
    "userInfo": {
      "role": 1,
      "role_name": "会员",
      "invite_code": "ABCD1234"
    },
    "stats": {
      "totalEarnings": "5280.00",
      "availableAmount": "3200.00",
      "frozenAmount": "500.00"
    },
    "team": {
      "totalCount": 18
    }
  }
}
```

### `GET /stats/distribution` — 分销统计数据

### `GET /commissions/preview` — 佣金预览

### `GET /team/members` — 团队成员列表

**请求参数**：`page`、`limit`

### `GET /distribution/invite` — 获取邀请信息（邀请码、邀请海报）

---

## 11. 钱包与提现

### `GET /wallet/info` — 钱包信息

```json
{
  "code": 0,
  "data": {
    "available_amount": "3200.00",
    "frozen_amount": "500.00",
    "total_withdrawn": "1500.00"
  }
}
```

### `GET /wallet/commissions` — 佣金明细

**请求参数**：`page`、`limit`

### `POST /wallet/withdraw` — 申请提现

```json
{
  "amount": "500.00",
  "method": "wechat"
}
```

---

## 12. 活动玩法

### 拼团

| 接口 | 方法 | 说明 |
|------|------|------|
| `/group/activities` | GET | 拼团活动列表 |
| `/group/my` | GET | 我的拼团记录 |
| `/group/orders` | POST | 发起/参与拼团 |

### 砍价

| 接口 | 方法 | 说明 |
|------|------|------|
| `/slash/activities` | GET | 砍价活动列表 |
| `/slash/my/list` | GET | 我的砍价记录 |
| `/slash/start` | POST | 发起砍价 |

### 抽奖

| 接口 | 方法 | 说明 |
|------|------|------|
| `/lottery/prizes` | GET | 奖品列表 |
| `/lottery/records` | GET | 抽奖记录 |
| `/lottery/draw` | POST | 执行抽奖（消耗积分） |

### 优惠券

| 接口 | 方法 | 说明 |
|------|------|------|
| `/coupons/mine` | GET | 我的优惠券列表 |

---

## 13. 用户功能

### 收货地址

| 接口 | 方法 | 说明 |
|------|------|------|
| `/addresses` | GET | 地址列表 |
| `/addresses` | POST | 新增地址 |
| `/addresses/{id}` | PUT | 修改地址 |
| `/addresses/{id}` | DELETE | 删除地址 |
| `/addresses/{id}/default` | POST | 设为默认地址 |

### 通知

| 接口 | 方法 | 说明 |
|------|------|------|
| `/notifications` | GET | 通知列表（含未读数 `unread_count`） |
| `/notifications/{id}/read` | PUT | 标记已读 |

### 物流追踪

| 接口 | 方法 | 说明 |
|------|------|------|
| `/logistics/track/{trackingId}` | GET | 物流轨迹查询 |

---

## 14. 其他接口

### `GET /agent/workbench` — 代理商工作台

### `GET /agent/orders` — 代理商订单

### `POST /agent/restock` — 代理采购入仓

### `GET /stations` — 服务站列表（地图页）

### `POST /stations/{id}/claim` — 申请成为服务站

### `GET /questionnaire/active` — 当前激活的问卷

### `POST /questionnaire/submit` — 提交问卷

```json
{
  "inviter_id": 1,
  "answers": { "q1": "answer1" }
}
```

### `GET /rules` — 规则说明文本（服务条款 / 活动规则）

**响应**：`{ "code": 0, "data": { "content": "富文本 HTML 字符串" } }`

---

## 附录：图片规范总结

| 位置 | 推荐尺寸 | 格式 |
|------|---------|------|
| 首页主轮播 (`posters`) | 1000×600px | JPG / WebP |
| 活动页轮播 (`banners`) | 1000×500px | JPG / WebP |
| 会员轮播 (`memberPosters`) | 800×400px | JPG / WebP |
| 会员卡片 (`memberBanners`) | 1000×500px | JPG / WebP |
| 方案海报 (`schemePosters`) | 400×600px | JPG / WebP |
| 星品产品图 (`starSections`) | 800×800px | JPG / WebP |
| 新品推荐图 (`newArrivals`) | 400×400px | JPG / WebP |
| 活动卡片图 (`cardPosters`) | 600×400px | JPG / WebP |
| 商品缩略图 | 400×400px | JPG / WebP |
| 商品详情大图 | 750×750px | JPG / WebP |

> **建议**：所有图片上传至 CDN（腾讯云 COS / 阿里云 OSS），单张大小不超过 300KB，首页图片推荐 WebP 格式以提升加载速度。
