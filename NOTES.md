# 项目笔记（开发者工作日志）

## 当前状态：云开发迁移后收口阶段

---

## 2026-04-11 修复记录

### 1. 退款审核（approve）持久化 ✅
**问题**：后端写入 CloudBase 用的是 replaceCollection（全量替换），在云函数15秒超时内会失败，导致状态无法持久化。
**修复**：引入 `directPatchDocument` 工具函数，对单条记录做 `db.collection().doc().update()` 精确更新，approve/reject/complete 端点全部改用此方式。

### 2. 确认退款（complete）无效 ✅
**根本原因**：微信支付分支调用 `createWechatRefund` 后，只用了 `patchCollectionRow + flush`（静默失败），没有调用 `directPatchDocument`，导致：
- 状态在内存里变成 `processing`，CloudBase 未更新
- 接着 `ensureFreshCollections` 从 CloudBase 重读，拿到的还是 `approved`
- 返回给前端 status 依然是 `approved`，按钮依然可见
- **每次点击都生成新的 refund_no（含 Date.now()），有双重退款风险**

**修复要点**：
1. 调用微信 API 前先 `directPatchDocument` 写入 `status: processing` + `refund_no`（幂等锁）
2. 微信 API 成功后 `directPatchDocument` 更新 wx_refund_id、wx_status
3. 出错时 `directPatchDocument` 回滚到 `approved` + 记录 wx_error

### 3. 邀请海报页问题 ✅
**截图现象**：头像灰圆、昵称"新用户"、二维码区域显示"扫码访问"占位文字

**根本原因分析**：
- 头像灰/昵称"新用户"：用户从未在小程序内设置资料（2022年微信政策变化，不能自动获取）；海报页没有在生成前拉取最新用户资料
- "扫码访问"占位：`invitePosterCore.js` 向旧服务器 `api.wenlan.store/api/distribution/wxacode-invite` 发 HTTP 请求，旧服务器返回占位图（或该域名失效后返回错误图）；且 admin-api 完全没有此路由

**修复**：
1. distribution 云函数 `wxacodeInvite` action 改为调用 `cloud.openapi.wxacode.getUnlimited()`，返回 base64 图片
2. `invitePosterCore.js` 改用 `callFn('distribution', {action:'wxacodeInvite'})` 代替 HTTP 请求，base64 写入临时文件后用于绘图
3. `invite-poster.js` onShow 时并行调用 `fetchUserProfile()` 确保头像/昵称最新
4. `miniprogram/utils/request.js` 加了 `GET /distribution/wxacode-invite` 路由（备用）

---

## 项目架构关键点（防遗忘）

### 云函数 vs HTTP 层
- 小程序 → 用 `callFn`（wx.cloud.callFunction）走 ROUTE_TABLE，不走 HTTP
- 管理后台 admin-ui → 用 axios 走 admin-api（CloudBase Run HTTP 服务）
- 二进制数据（图片）无法经云函数直接返回，走 base64 编码后 JSON 传输

### 持久化层（admin-api）
- `directPatchDocument(collection, docId, data)` - 精确更新单条 CloudBase 文档 ✅ 用这个
- `patchCollectionRow + flush` - 内存操作+全量替换，在云函数15s限制内容易失败 ❌ 状态关键写入不用这个

### 退款状态机
pending → approved（审核通过）→ processing（微信退款处理中）→ completed（退款成功）
                                                              ↘ failed（退款失败）
pending → rejected（拒绝）

### 邀请关系绑定
- `my_invite_code` 是用户自己的邀请码（优先）
- `invite_code` 是老字段（兼容）
- 用户注册时 `invite_code` 字段设为空串，`my_invite_code` 生成随机码

---

## 当前待关注问题

### ⚠️ 用户头像/昵称缺失
2022年微信隐私政策后，小程序不能自动获取用户真实昵称和头像。
建议在"个人资料"页加一个引导提示，让用户主动设置头像和昵称（使用 `<button open-type="chooseAvatar">`）。
目前"编辑资料"页已有头像上传入口，但新用户可能不知道需要主动设置。

### ⚠️ distribution 云函数大小
distribution/index.js 包含了过多业务逻辑（分销、团队、提现、佣金、邀请码、代理钱包...），
文件超过600行，后续应考虑拆分为多个子模块。

### ⚠️ api.wenlan.store 旧服务器
env.js 中 apiBaseUrl 指向 `https://api.wenlan.store/api`，但这是迁移前旧服务器地址。
小程序已全面改为云函数，apiBaseUrl 实际已无用（ROUTE_TABLE 拦截了所有路由）。
但 invitePosterCore.js 曾用它发 HTTP 请求，已修复改为云函数。
如果旧服务器有其他服务仍在使用，需评估是否可以下线。
