# 臻选小程序前端功能文档（滴水不漏版）

面向对象：产品/运营/设计（含 Figma AI）与前端开发  
代码范围：`c:\Users\21963\WeChatProjects\zz\qianduan`

## 0. 全局约定

### 0.1 页面路由与 TabBar

路由配置见 [app.json](file:///c:/Users/21963/WeChatProjects/zz/qianduan/app.json#L1-L66)。

- **TabBar（4 个）**
  - `/pages/index/index`：首页
  - `/pages/category/category`：分类
  - `/pages/cart/cart`：购物车
  - `/pages/user/user`：我的
- **非 Tab 页面**：商品详情、下单/订单/售后、地址、分销中心/团队/工作台/库存、钱包、通知、搜索

### 0.2 登录、分享绑定、全局缓存

入口与自动登录见 [app.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/app.js#L1-L122)。

- **启动时行为**
  - `onLaunch(options)`：先解析分享/扫码参数写入本地缓存，再 `autoLogin()`
- **分享/扫码绑定**
  - 扫码：`options.query.scene`（解码后作为 `distributor_id`）
  - 分享：`options.query.share_id`（作为 `distributor_id`）
  - 写入：`wx.setStorageSync('distributor_id', <id>)`
- **自动登录**
  - 若缓存中同时存在 `userInfo/openid/token`，则直接恢复登录态
  - 否则调用 `wxLogin()` 走 `wx.login` → 后端 `/login`
- **关键缓存 Key**
  - `userInfo`：用户资料（含 `role_level`/`invite_code`/`stock_count` 等）
  - `openid`：微信 openid
  - `token`：JWT Token（`Authorization: Bearer <token>`）
  - `distributor_id`：上级/邀请人标识（分享/扫码/页面参数写入）
  - `searchHistory`：搜索历史（最多 10 条，去重）
  - `directBuyInfo`：商品详情“直接购买”临时下单数据（订单确认页读取后清除）
  - `selectedAddress`：地址选择页返回时传递给订单确认页的临时地址

### 0.3 网络请求封装与错误表现

封装见 [request.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/utils/request.js#L1-L117)。

- **基础地址**
  - `config.baseUrl = https://api.jxalk.cn/api`（注意：`app.globalData.baseUrl` 也写了同一地址，但实际请求以 `request.js` 为准）
- **请求头**
  - `Authorization: Bearer <token>`（从 `token` 读取）
  - `x-openid: <openid>`（向下兼容/调试用）
- **成功判定**
  - HTTP 2xx 且业务层 `success !== false && code !== -1` → `resolve(res.data)`
- **错误提示**
  - 默认 `showError=true`：`wx.showToast(...)`
  - `showLoading=true`：请求前 `wx.showLoading`，完成后 `wx.hideLoading`
- **401 过期**
  - 清除 `token/openid/userInfo`
  - Toast：`登录已过期，请重新进入`
  - 自动触发 `app.wxLogin()`（失败静默）

### 0.4 角色与价格体系（前端展示逻辑）

角色主要由 `userInfo.role_level` 决定（映射在多个页面中出现）：
- `0`：普通用户
- `1`：会员
- `2`：团长
- `3`：代理商

商品详情页展示价计算见 [detail.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/product/detail.js#L60-L82)：
- `role_level=0`：`retail_price`
- `role_level=1`：`price_member || retail_price`
- `role_level=2`：`price_leader || price_member || retail_price`
- `role_level=3`：`price_agent || price_leader || price_member || retail_price`

## 1. 页面清单（以 app.json 为准）

| 页面 | 路径 | 入口 |
|---|---|---|
| 首页 | `/pages/index/index` | TabBar |
| 分类 | `/pages/category/category` | TabBar / 首页金刚区 |
| 购物车 | `/pages/cart/cart` | TabBar / 详情页底栏 |
| 我的 | `/pages/user/user` | TabBar |
| 商品详情 | `/pages/product/detail?id=<productId>` | 首页/分类/搜索/订单再次购买/购物车 |
| 搜索 | `/pages/search/search` | 首页/分类 |
| 订单列表 | `/pages/order/list?status=<status>` | 我的/分佣中心/下单成功 |
| 订单详情 | `/pages/order/detail?id=<orderId>` | 订单列表 |
| 订单确认 | `/pages/order/confirm?cart_ids=1,2` 或 `/pages/order/confirm?from=direct` | 购物车结算 / 直接购买 |
| 退款申请 | `/pages/order/refund-apply?order_id=<orderId>` | 订单详情 |
| 退款列表 | `/pages/order/refund-list` | 我的/分佣中心 |
| 退款详情 | `/pages/order/refund-detail?id=<refundId>` | 退款列表 |
| 地址列表 | `/pages/address/list` 或 `/pages/address/list?select=true` | 我的/订单确认 |
| 地址编辑 | `/pages/address/edit` 或 `/pages/address/edit?id=<addressId>` | 地址列表/订单确认 |
| 分佣中心 | `/pages/distribution/center?tab=logs` | 我的（佣金明细/工具入口） |
| 团队 | `/pages/distribution/team` | 我的/分佣中心 |
| 代理商工作台 | `/pages/distribution/workbench` | 分佣中心（代理专区）/我的（代理入口） |
| 采购入仓 | `/pages/distribution/restock` | 商品详情（代理）/工作台/库存明细 |
| 库存明细 | `/pages/distribution/stock-logs` | 分佣中心/工作台 |
| 钱包 | `/pages/wallet/index` | 我的 |
| 通知 | `/pages/user/notifications` | 我的/分佣中心 |

## 2. 页面逐个详解

### 2.1 首页 `/pages/index/index`

代码： [index.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/index/index.js#L1-L162)、[index.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/index/index.wxml#L1-L118)

**路由入参**
- `share_id`：邀请人标识（分享进来时写入 `distributor_id`，若已登录则尝试绑定）

**数据字段（data）**
- `banners[]`：首页轮播
- `products[]`：推荐商品
- `categories[]`：全量分类
- `topCategories[]`：金刚区 3 个分类（不足用默认补齐）
- `currentCategory`：当前筛选分类 id（空字符串表示全部）
- `loading`：页面加载态
- `isScrolled`：滚动超过 20px 后顶栏样式切换

**UI 结构（WXML）**
- 顶部顶栏：搜索条（点击进入搜索）、右侧消息按钮（仅展示，无点击事件绑定）
- 主视觉：轮播 `swiper`（有 banner 时展示，否则展示默认占位文案）
- 金刚区：固定“全部商品” + `topCategories` 3 个入口
- 分类导航：横向滚动，包含“全部”与 `categories`
- 为你推荐：双列商品卡片（NEW 标、价格、原价、选购按钮）
- 空状态：无商品且不在加载时显示
- 全屏加载：`loading` 为 true 时显示

**交互与流程**
- 页面滚动：`onPageScroll` 切换 `isScrolled`
- 下拉刷新：重新 `loadData()` 后 `stopPullDownRefresh`
- 点击搜索：`navigateTo('/pages/search/search')`
- 点击 Banner：若 `link_type==='product'` 且 `link_value` 存在 → 跳转详情
- 点击金刚区/分类导航：
  - `data-id` 为空：加载全部商品
  - `data-id` 为 `__hot/__new/__sale`：直接 `switchTab('/pages/category/category')`
  - 其他：设置 `currentCategory` 后调用 `loadProducts(categoryId)`
- 点击商品卡：进入商品详情
- 分享：`path=/pages/index/index?share_id=<inviteCode>`（inviteCode 优先 `userInfo.invite_code`，否则 `userInfo.id`）

**接口清单**
- `GET /content/banners`，参数 `{ position: 'home' }` → `banners`
- `GET /products`，参数 `{ limit: 10 }` → `products`
- `GET /categories` → `categories`
- 点击分类后：`GET /products`，参数 `{ limit: 20, category_id? }`
- 邀请绑定（已登录时）：`POST /bind-parent`，参数 `{ parent_id: Number(share_id) }`

**状态与提示**
- 数据加载失败：控制台 `console.error`，页面结束 loading，但不弹 Toast（`loadData` 内未显式 toast）
- 绑定上级失败：忽略（通常表示“已有上级”）

### 2.2 分类页 `/pages/category/category`

代码： [category.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/category/category.js#L1-L138)、[category.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/category/category.wxml#L1-L95)

**数据字段**
- `categories[]`：分类列表
- `products[]`：商品列表
- `currentCategory`：当前分类 id（空字符串为全部）
- `currentCategoryName`：当前分类名（用于场景标题）
- `sortBy`：`default/sales/price`
- `sortOrder`：`asc/desc`（仅 price 可切换）
- `page/limit/hasMore/loading`：分页加载

**UI 结构**
- 顶部搜索栏（点击进入搜索）
- 场景化横滑分类卡片（含“全部” + 分类卡，分类卡图标优先 `item.icon`，否则默认图标）
- 商品区域为可滚动 `scroll-view`，到底自动触发加载更多
- 顶部（选中分类时）显示场景标题 + 描述
- 排序条：综合/销量/价格（价格显示 ↑↓）
- 商品网格：图片/热标/名称/价格/销量/右下角“+”快捷加购

**交互与流程**
- 初次加载：并行 `loadCategories()` + `loadProducts()`
- 下拉刷新：重置分页后重新加载商品
- 切换分类：重置分页与标题，重新加载商品
- 排序：
  - 点击同一个 price：切换 asc/desc
  - 其他排序项：设置默认顺序（sales 默认 desc，price 首次 asc）
- 到底加载更多：`bindscrolltolower` → `onLoadMore` → `loadProducts(true)`
- 商品点击：进入详情
- 快捷加购：显示 loading → `POST /cart` → toast 成功/失败

**接口清单**
- `GET /categories`
- `GET /products`，参数包含：`page, limit, category_id?, sort?, order?`
- `POST /cart`，参数 `{ product_id, quantity: 1 }`

**状态与提示**
- 加载失败：控制台输出；快捷加购失败弹 Toast“加入失败”

### 2.3 搜索页 `/pages/search/search`

代码： [search.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/search/search.js#L1-L90)、[search.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/search/search.wxml#L1-L84)

**数据字段**
- `keyword`：输入框内容
- `products[]`：搜索结果
- `history[]`：历史记录（缓存 `searchHistory`）
- `hotKeywords[]`：静态热门词
- `loading`：搜索请求中
- `hasSearched`：是否已触发过搜索（决定展示“历史/热门”还是“结果”）

**交互与流程**
- 输入：更新 `keyword`
- 清空：清空输入并重置结果
- 取消：返回上一页
- 点击历史/热门：直接执行搜索并把关键词写入输入框
- 键盘确认（confirm-type=search）：若空则 Toast 提示；否则 `doSearch`
- 保存历史：去重、最多 10 条、写入缓存
- 清空历史：Modal 确认后清除缓存
- 点击商品：进入详情

**接口清单**
- `GET /products`，参数 `{ keyword, limit: 50 }`

### 2.4 商品详情页 `/pages/product/detail`

代码： [detail.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/product/detail.js#L1-L242)、[detail.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/product/detail.wxml#L1-L145)

**路由入参**
- `id`：商品 id（必需）
- `share_id`：邀请人标识（写入 `distributor_id`）

**数据字段**
- `product`：详情对象（会被补充 `displayPrice`）
- `skus[]`：SKU 列表
- `selectedSku`：当前选中 SKU（默认第一个）
- `quantity`：购买数量（最小 1，最大库存）
- `currentImage/imageCount`：轮播状态
- `showSku`：SKU 弹窗显示
- `cartCount`：购物车数量角标
- `skuAction`：`cart/buy`（决定弹窗确认动作）
- `roleLevel`：从本地 `userInfo.role_level` 读取

**UI 结构**
- 顶部大图轮播 + 计数器 + 返回按钮
- 价格区：大号价格 + 原价 + 身份标签（会员/团长/代理）
- 标题/副标题
- 代理商分享卡片：仅 `roleLevel>=3` 展示（含“立即分享”按钮 open-type=share）
- 服务保障区：图标 + 文案
- 规格入口：有 SKU 时显示，点击打开 SKU 弹窗
- 详情区：`rich-text` + 详情图（空则“暂无详情”）
- 底部操作栏：
  - 购物车入口（switchTab 到购物车）+ 数量角标
  - 按钮：代理商“采购入仓”（仅代理）/加入购物车/立即购买
- SKU 弹窗：遮罩、头部图/价/库存、规格列表、数量控制、两种确认按钮

**交互与流程**
- 进入页面：`loadProduct(id)`，并写入 `distributor_id`（如果有 share_id）
- 页面展示：每次 `onShow` 刷新 `cartCount`
- 图片预览：点击图片 `wx.previewImage`
- SKU：
  - 打开/关闭弹窗
  - 选择 SKU（无库存不可选）
  - 数量 +/-（限制库存上限：`selectedSku.stock || product.stock || 999`）
- 加入购物车：
  - 先打开 SKU 弹窗（`skuAction=cart`），确认后 `POST /cart`
- 立即购买：
  - 打开 SKU 弹窗（`skuAction=buy`），确认后写入 `directBuyInfo` 并跳转订单确认页 `from=direct`
- 代理商采购入仓：跳转 `/pages/distribution/restock`
- 分享：`/pages/product/detail?id=<id>&share_id=<inviteCode>`，带首图

**接口清单**
- `GET /products/<id>`：返回商品详情（会解析 `images/detail_images` 字符串 JSON）
- `GET /cart`：用于角标数量（容错 catch）
- `POST /cart`：参数 `{ product_id, sku_id?, quantity }`

**状态与提示**
- `loadProduct`：`wx.showLoading('加载中...')`，失败 toast“加载失败”
- 加购：loading + toast 成功/失败

### 2.5 购物车 `/pages/cart/cart`

代码： [cart.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/cart/cart.js#L1-L161)、[cart.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/cart/cart.wxml#L1-L91)

**数据字段**
- `cartItems[]`：购物车项（前端追加字段 `selected/price`）
- `selectAll`：全选状态
- `totalPrice`：选中商品合计
- `totalCount`：选中数量合计
- `loading`：加载状态

**数据转换规则**
- 接口返回：`{ items: [...], summary: {...} }` 或直接数组（做了兼容）
- `selected`：默认 `item.selected !== false`（与后端选中状态对齐）
- `price`：`sku.retail_price || product.retail_price`（注意：购物车页自身未使用 effective_price）

**交互与流程**
- 每次进入页面（`onShow`）刷新购物车
- 勾选单项：仅改前端状态并重新计算总价（不回写后端）
- 全选/全不选：仅改前端状态并重新计算
- 改数量：`PUT /cart/<cartItemId>` 成功后更新前端数量
- 删除：Modal 确认后 `DELETE /cart/<cartItemId>` 并从列表移除
- 去结算：必须至少选中 1 项；拼接 `cart_ids` 跳转订单确认页
- 点击商品：跳转商品详情（使用 `item.product_id`）

**接口清单**
- `GET /cart`
- `PUT /cart/<id>`，参数 `{ quantity }`
- `DELETE /cart/<id>`

### 2.6 订单确认 `/pages/order/confirm`

代码： [confirm.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/order/confirm.js#L1-L186)、[confirm.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/order/confirm.wxml#L1-L77)

**路由入参（两种来源）**
- 购物车结算：`cart_ids=1,2,3`
- 直接购买：`from=direct`（从缓存读取 `directBuyInfo`）

**数据字段**
- `from`：`cart/direct`
- `address`：当前收货地址（默认地址或用户选择地址）
- `orderItems[]`：提交订单的商品行
- `remark`：订单备注
- `totalAmount/totalCount`
- `loading/submitting/showSuccess`

**交互与流程**
- 页面初始化：
  - direct：读取 `directBuyInfo` → 直接组装 `orderItems`、计算合计
  - cart：调用 `loadCartItems(cart_ids)`，从 `GET /cart` 中筛选所选项组装 `orderItems`
  - 同时加载默认地址：`loadDefaultAddress()`
- 地址选择：跳转 `/pages/address/list?select=true`，返回后从缓存读 `selectedAddress`
- 新增地址：跳转 `/pages/address/edit`
- 备注输入：同步 `remark`
- 提交订单：
  - 校验：必须有地址、必须有订单项、避免重复提交
  - `POST /orders/create`，提交 `address_id/remark/items[]`
  - 成功：显示成功弹窗；若 direct 来源则清除 `directBuyInfo`
- 成功弹窗按钮：
  - 查看订单：`redirectTo('/pages/order/list?status=pending')`
  - 返回首页：`switchTab('/pages/index/index')`

**接口清单**
- `GET /addresses`：取默认地址（`is_default` 优先）
- `GET /cart`：结算时筛选所选项
  - 价格取 `item.effective_price` 优先（用于等级价）
- `POST /orders/create`：参数
  - `address_id`
  - `remark`
  - `items[]: { product_id, sku_id?, quantity, cart_id? }`

### 2.7 订单列表 `/pages/order/list`

代码： [list.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/order/list.js#L1-L178)、[list.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/order/list.wxml#L1-L87)

**路由入参**
- `status`：筛选状态（`pending/paid/shipped/completed` 等）

**数据字段**
- `orders[]`
- `currentStatus`
- `page/limit/hasMore/loading`
- `statusText`：状态展示字典（含 `agent_confirmed/shipping_requested/refunding` 等）

**交互与流程**
- 初始化：读取 status 后加载
- 每次进入页面（`onShow`）刷新（重置分页并重新加载）
- 下拉刷新：重置分页并重新加载
- Tab 切换：更新 `currentStatus` 并重新加载
- 到底加载更多：`scroll-view` → `onLoadMore` → `loadOrders(true)`
- 点击订单卡：进入订单详情
- 取消订单：Modal 确认 → `POST /orders/<id>/cancel`
- 去付款：跳转订单详情（支付动作在详情页）
- 确认收货：Modal 确认 → `POST /orders/<id>/confirm`
- 再次购买：优先使用 `order.product_id`，否则 `order.product.id`，都没有则回首页

**接口清单**
- `GET /orders`，参数 `{ page, limit, status? }`
- `POST /orders/<id>/cancel`
- `POST /orders/<id>/confirm`

### 2.8 订单详情 `/pages/order/detail`

代码： [detail.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/order/detail.js#L1-L165)、[detail.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/order/detail.wxml#L1-L154)

**路由入参**
- `id`：订单 id

**数据字段**
- `order`：订单详情
- `statusMap/statusDescMap`：状态文案
- `loading`

**UI 结构**
- 状态卡片：状态 + 描述
- 进度条：付款/确认/发货/收货（基于 `paid_at/agent_confirmed_at/shipped_at/completed_at` 或 status）
- 收货信息卡：`order.address` 存在时显示
- 商品信息卡：单商品订单展示
- 订单信息卡：订单号、下单/支付/发货/签收时间、金额、物流单号复制、发货方式、备注
- 团队归属卡：`agent/distributor` 信息
- 佣金结算提示：已完成且存在 `settlement_at` 时展示
- 底部按钮：按状态呈现（待付款/已发货/已完成/已付款）

**交互与流程**
- 加载订单：`GET /orders/<id>`，解析商品图片字符串 JSON
- 支付（模拟）：Modal 确认 → `POST /orders/<id>/pay` → 成功刷新详情
- 取消订单：Modal → `POST /orders/<id>/cancel`
- 确认收货：Modal → `POST /orders/<id>/confirm`
- 申请退款：跳转 `/pages/order/refund-apply?order_id=<id>`
- 查看物流：尝试跳转 `/pages/order/logistics?id=<id>`（当前工程内未找到该页面文件）
- 复制单号：写入剪贴板

**接口清单**
- `GET /orders/<id>`
- `POST /orders/<id>/pay`
- `POST /orders/<id>/cancel`
- `POST /orders/<id>/confirm`

### 2.9 退款申请 `/pages/order/refund-apply`

代码： [refund-apply.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/order/refund-apply.js#L1-L154)、[refund-apply.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/order/refund-apply.wxml#L1-L77)

**路由入参**
- `order_id`：订单 id（必需）
- `type`：可选，预设退款类型

**数据字段**
- `type`：`refund_only`（仅退款）/`return_refund`（退货退款）
- `reason/reasonIndex`：原因选择
- `description`：问题描述
- `amount`：退款金额（默认订单总额）
- `refundQuantity`：退货数量（仅退货退款展示）
- `submitting`

**交互与流程**
- 加载订单：`GET /orders/<id>`，预填 `amount=order.total_amount`
- 选择类型：切换到退货退款时默认 `refundQuantity=order.quantity`
- 选择原因：picker
- 输入说明/金额/数量
- 校验：
  - 必须选原因
  - 金额必须 >0 且不超过订单金额
  - `return_refund` 必须填写 `refund_quantity > 0`
- 提交：`POST /refunds`
  - 仅退款不传 `refund_quantity`（后端默认 0）
  - 成功 toast 后返回上一页

**接口清单**
- `GET /orders/<id>`
- `POST /refunds`，参数 `{ order_id, type, reason, description, amount, refund_quantity? }`

### 2.10 退款列表 `/pages/order/refund-list`

代码： [refund-list.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/order/refund-list.js#L1-L96)、[refund-list.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/order/refund-list.wxml#L1-L48)

**数据字段**
- `refunds[]`
- `page/limit/hasMore/loading`
- `statusText/typeText`：展示文案字典

**交互与流程**
- 每次显示刷新列表（重置分页）
- 到底加载更多：`bindscrolltolower` → `onLoadMore`
- 点击卡片：进入退款详情
- 取消申请：仅 `pending` 可见 → Modal → `PUT /refunds/<id>/cancel` → 刷新列表

**接口清单**
- `GET /refunds`，参数 `{ page, limit }`
- `PUT /refunds/<id>/cancel`

### 2.11 退款详情 `/pages/order/refund-detail`

代码： [refund-detail.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/order/refund-detail.js#L1-L51)、[refund-detail.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/order/refund-detail.wxml#L1-L77)

**路由入参**
- `id`：退款单 id

**交互与流程**
- `GET /refunds/<id>` 加载详情并解析商品图片字符串 JSON
- 展示：状态卡、金额、商品信息、退款信息（类型/原因/描述/时间/客服备注等）

**接口清单**
- `GET /refunds/<id>`

### 2.12 地址列表 `/pages/address/list`

代码： [list.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/address/list.js#L1-L84)、[list.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/address/list.wxml#L1-L48)

**路由入参**
- `select=true`：选择模式（订单确认页进入）

**数据字段**
- `addresses[]`
- `loading`
- `selectMode`

**交互与流程**
- 页面显示时拉取地址列表
- 选择模式：点击地址卡 → 写入 `selectedAddress` → 返回
- 新增：跳转地址编辑（无 id）
- 编辑：跳转地址编辑（带 id）
- 删除：Modal → `DELETE /addresses/<id>` → 刷新
- 设为默认：`POST /addresses/<id>/default` → 刷新

**接口清单**
- `GET /addresses`
- `DELETE /addresses/<id>`
- `POST /addresses/<id>/default`

### 2.13 地址编辑 `/pages/address/edit`

代码： [edit.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/address/edit.js#L1-L135)、[edit.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/address/edit.wxml#L1-L44)

**路由入参**
- `id`：编辑模式（通过列表进入）

**数据字段**
- `form`：收货人/手机号/省市区/详细地址/是否默认
- `regionText`：省市区展示文案
- `submitting`

**交互与流程**
- 编辑模式：页面标题改为“编辑地址”，并从 `GET /addresses` 中找到对应 id 回填（当前实现是“拉全量后本地查找”）
- 省市区选择：使用系统 `picker mode=region`
- 校验：
  - 姓名必填
  - 手机号：`^1\d{10}$`
  - 省市区必选
  - 详细地址必填
- 保存：
  - 新增：`POST /addresses`
  - 编辑：`PUT /addresses/<id>`
  - 成功 toast 后返回

**接口清单**
- `GET /addresses`
- `POST /addresses`
- `PUT /addresses/<id>`

### 2.14 我的 `/pages/user/user`

代码： [user.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/user/user.js#L1-L335)、[user.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/user/user.wxml#L1-L220)

**数据字段**
- `userInfo/isLoggedIn`：登录态与用户信息（优先服务端刷新）
- `orderCounts`：待付款/待发货/待收货/售后数量
- `distributionInfo`：累计佣金/可提现/团队人数/角色名
- `notificationsCount`：未读通知数
- 修改昵称：`showNicknameModal/newNickname`

**核心流程**
- 每次进入页面（`onShow`）：`loadUserInfo()`
- 未登录：
  - 展示登录提示卡
  - 用户信息使用 `app.globalData.userInfo`（可能为空）
- 已登录：
  - `GET /user/profile` 刷新并写回 `app.globalData` 与缓存
  - 并行加载：
    - 订单数量：`GET /orders`（4 次、每次 limit=1，用 pagination.total）
    - 分销概览：`GET /distribution/overview`
    - 通知计数：`GET /notifications`（limit=1，用 `unread_count`）

**交互与入口**
- 登录：`app.wxLogin()`（封装在全局 app 中）
- 修改昵称：弹窗 → `PUT /user/profile { nickname }`
- 累计佣金：跳分佣中心并定位到 `tab=logs`
- 钱包：跳 `/pages/wallet/index`
- 团队：跳 `/pages/distribution/team`
- 全部订单：跳 `/pages/order/list`
- 按状态订单：跳 `/pages/order/list?status=<status>`
- 售后：跳 `/pages/order/refund-list`
- 通知：跳 `/pages/user/notifications`
- 设置：ActionSheet（仅实现“清除缓存”）
- 关于：Modal 展示版本与客服微信
- 联系客服：Modal，可复制微信号
- 菜单入口（常用服务等）：通用 `onMenuTap`，未登录会拦截
- 复制邀请码：写入剪贴板
- 退出登录：Modal 确认 → `app.logout()`
- 分享：`/pages/index/index?share_id=<inviteCode>`

**接口清单**
- `GET /user/profile`
- `PUT /user/profile`
- `GET /orders`（多 status）
- `GET /distribution/overview`
- `GET /notifications`

### 2.15 通知 `/pages/user/notifications`

代码： [notifications.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/user/notifications.js#L1-L86)、[notifications.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/user/notifications.wxml#L1-L27)

**数据字段**
- `notifications[]`：列表（前端追加 `created_at_format`）
- `page/limit/hasMore/loading`

**交互与流程**
- 初次加载：`loadNotifications()`
- 下拉刷新：清空列表、重置分页并重新加载
- 触底加载：`onReachBottom` → `loadNotifications(true)`
- 点击通知：若未读则 `PUT /notifications/<id>/read`，并将该条 `is_read=true`
- 时间格式化：刚刚/分钟前/小时前/`M-D`

**接口清单**
- `GET /notifications`，参数 `{ page, limit }`
- `PUT /notifications/<id>/read`

### 2.16 分佣中心 `/pages/distribution/center`

代码： [center.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/distribution/center.js#L1-L361)、[center.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/distribution/center.wxml#L1-L229)

**路由入参**
- `tab=logs`：从“我的-累计佣金”跳转时，用于直达佣金明细/提现等（当前实现 `activeTab` 为 `overview/withdraw`，但也兼容传入任意字符串）

**数据字段（核心）**
- 用户与团队：`userInfo/team/inviteCode/hasParent/parentInfo`
- 佣金统计：`stats.totalEarnings/availableAmount/frozenAmount`
- 钱包：`balance/walletInfo`
- 佣金明细：`commissionLogs[]`（带状态映射、类型映射）
- 提现：`showWithdraw/withdrawAmount/withdrawals[]`
- 邀请码绑定：`showBindInvite/bindInviteCode`
- 通知：`latestNotifications[]/unreadCount`
- 代理专区：`isAgent/agentStock/agentPending/agentMonthProfit/agentDebt`

**UI 结构**
- 用户卡：头像、昵称、等级、邀请人信息/绑定入口、通知铃铛
- 资金总览：累计佣金、可提现余额、待结算、提现按钮
- 菜单：团队/分销订单/退货管理/邀请好友
- 代理专区（仅代理可见）：库存概览、待发货、本月利润、工作台/采购入仓/库存明细入口、欠款提示
- 最近通知（最多展示 3 条）
- 邀请码卡：复制/分享/填写邀请码入口
- Tab：佣金明细 / 提现记录
- 弹窗：提现弹窗、绑定邀请码弹窗

**交互与流程**
- 每次显示页面并行加载：
  - `GET /stats/distribution`（统计/团队/用户信息/邀请关系）
  - `GET /wallet`（余额概览）
  - `GET /wallet/commissions`（佣金明细）
  - `GET /notifications`（最新消息）
  - `GET /agent/workbench`（代理数据，非代理会 403 静默）
- 绑定邀请码：
  - 若已绑定上级：toast“您已绑定上级”
  - 输入邀请码并确认：`POST /bind-parent { parent_id: code }`（禁止绑定自己）
- 提现：
  - 弹窗输入金额 → `POST /wallet/withdraw { amount }` → 成功后刷新钱包与提现记录
- 入口跳转：
  - 通知：`/pages/user/notifications`
  - 退货：`/pages/order/refund-list`
  - 团队：`/pages/distribution/team`
  - 分销订单：`/pages/order/list`
  - 代理工作台：`/pages/distribution/workbench`
  - 采购入仓：`/pages/distribution/restock`
  - 库存明细：`/pages/distribution/stock-logs`
- 分享：`/pages/index/index?share_id=<inviteCode>`

**接口清单**
- `GET /stats/distribution`
- `GET /wallet`
- `GET /wallet/commissions`
- `GET /wallet/withdrawals`
- `POST /wallet/withdraw`
- `POST /bind-parent`
- `GET /notifications`（limit=7）
- `GET /agent/workbench`（代理）

### 2.17 团队 `/pages/distribution/team`

代码： [team.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/distribution/team.js#L1-L101)、[team.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/distribution/team.wxml#L1-L67)

**数据字段**
- 统计：`directCount/indirectCount/totalCount/totalSales/monthlyNewMembers`
- 成员：`members[]`
- Tab：`currentTab=direct/indirect`
- 分页：`page/limit/hasMore/loading`

**交互与流程**
- 初次加载：`loadStats()` + `loadMembers()`
- 切换 Tab：清空列表重置分页，加载对应层级成员
- 触底加载更多：`onLoadMore` → `loadMembers(true)`
- 成员字段展示：头像、昵称、角色、加入时间、订单数、业绩

**接口清单**
- `GET /distribution/stats`
- `GET /distribution/team`，参数 `{ level: direct/indirect, page, limit }`

### 2.18 代理商发货工作台 `/pages/distribution/workbench`

代码： [workbench.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/distribution/workbench.js#L1-L157)、[workbench.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/distribution/workbench.wxml#L1-L124)

**数据字段**
- `workbench`：库存/待发货/待确认/累计发货/本月利润
- `orders[]`：待处理订单
- `activeStatus`：默认 `pending`
- 发货弹窗：`showShipPopup/shipOrder/shipCompany/shipTrackingNo`

**交互与流程**
- 每次进入页面：
  - `GET /agent/workbench` 拉取概览
  - `GET /agent/orders` 拉取订单列表
- Tab 切换：`activeStatus` 改变后重新加载订单
  - 当前实现 `statusMap` 只映射了 `pending/shipped/all`（页面上还有“待确认 shipping_requested”，会走默认空 status，即等价于全量）
- 发货：
  - 打开弹窗：记录当前订单
  - 校验：必须填写物流单号；库存不足则弹 Modal 引导去采购入仓
  - 确认发货：`POST /agent/ship/<orderId> { tracking_no, tracking_company }`
  - 成功：关闭弹窗并刷新概览与列表
- 快捷入口：采购入仓/库存明细

**接口清单**
- `GET /agent/workbench`
- `GET /agent/orders`，参数 `{ page:1, limit:50, status? }`，并解析 `address_snapshot/images`
- `POST /agent/ship/<id>`

### 2.19 采购入仓 `/pages/distribution/restock`

代码： [restock.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/distribution/restock.js#L1-L148)、[restock.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/distribution/restock.wxml#L1-L67)

**数据字段**
- `currentStock`：当前云仓库存
- `products[]`：可进货商品（过滤 `stock>0`）
- `selectedProduct`：选中商品
- `quantity`：进货数量（默认 10）
- `totalAmount`：合计金额（按代理价 * 数量）

**交互与流程**
- 每次进入页面：
  - `GET /agent/workbench` 获取当前库存
  - `GET /products` 拉取商品（取前 100），解析图片字符串 JSON，并计算 `agent_price`
- 选择商品：设置 `selectedProduct`，并计算合计
- 数量：
  - 输入/加减：限制最小 1，最大 `selectedProduct.stock`
  - 快捷数量：10/50/100/200
- 确认采购：
  - Modal 确认（文案含商品名/数量/总额）
  - `POST /agent/restock { product_id, quantity }`
  - 成功 toast 并刷新库存与商品列表

**接口清单**
- `GET /agent/workbench`
- `GET /products`，参数 `{ page:1, limit:100 }`
- `POST /agent/restock`

### 2.20 库存明细 `/pages/distribution/stock-logs`

代码： [stock-logs.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/distribution/stock-logs.js#L1-L108)、[stock-logs.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/distribution/stock-logs.wxml#L1-L63)

**数据字段**
- `currentStock`
- `logs[]`：库存变动记录（前端加 `time_format`）
- `activeFilter`：`all/in/out`（前端筛选）
- `page/limit/hasMore/loading`

**交互与流程**
- 每次进入页面：重置分页并加载日志
- 下拉刷新：重置分页并加载
- 触底：继续加载下一页
- 筛选：切换 `activeFilter` 后重置列表并加载（筛选在前端做）
- 403：提示“仅代理商可访问”并返回上一页
- 补货入口：跳采购入仓

**接口清单**
- `GET /agent/stock-logs`，参数 `{ page, limit }`（返回含 `current_stock/pagination`）

### 2.21 钱包 `/pages/wallet/index`

代码： [index.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/wallet/index.js#L1-L71)、[index.wxml](file:///c:/Users/21963/WeChatProjects/zz/qianduan/pages/wallet/index.wxml#L1-L40)

**数据字段**
- `balance`
- `logs[]`：资金明细（复用佣金接口）
- 提现弹窗：`showWithdraw/withdrawAmount`

**交互与流程**
- 每次进入页面：
  - `GET /wallet/info` 获取余额
  - `GET /wallet/commissions` 获取明细
- 提现：弹窗输入金额 → `POST /wallet/withdraw`

**接口清单**
- `GET /wallet/info`
- `GET /wallet/commissions`
- `POST /wallet/withdraw`

### 2.22 工程内存在但未注册的页面/入口（实现现状）

- `pages/user/preferences.js` 存在，但未在 [app.json](file:///c:/Users/21963/WeChatProjects/zz/qianduan/app.json#L1-L66) 的 `pages` 中注册，因此无法通过路由进入。
- 订单“查看物流”跳转到 `/pages/order/logistics`，但当前工程目录下未找到对应页面文件（跳转会失败）。
- 首页顶栏的“🔔 消息按钮”仅展示，无 `bindtap`，不会进入通知页。
- “我的”页的 `onShareTap()` 目前为空实现（点击“分享邀请”视觉上是入口，但不会触发分享；真正能分享的是页面右上角/按钮 open-type=share）。

