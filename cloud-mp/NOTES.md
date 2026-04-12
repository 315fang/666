# 小程序前端代码审计笔记

> 扫描范围：`miniprogram/` 目录所有 JS、WXML、WXSS 文件
> 审计时间：2026-04-11
> 修复时间：2026-04-11（所有问题已修复 ✅）

---

## 严重问题（可能导致功能异常）

### 1. `utils/request.js` — POST /slash/:id/help 路由参数名错误

**位置：** `utils/request.js` 第 90 行

```js
'POST /slash/:id/help': { fn: 'order', action: 'slashHelp', idKey: 'slash_id' },
```

**问题：**
`idKey` 为 `slash_id`，但实际从 URL 中提取的动态段是 `slash_no` 值（例如 `SL20240101XXXX`）。
当 `slash/detail.js` 调用 `post('/slash/${slashNo}/help')` 时，云函数收到的参数是 `{ slash_id: "SL..." }` 而不是 `{ slash_no: "SL..." }`。

对比同文件 GET 路由：
```js
'GET /slash/:id': { fn: 'order', action: 'slashDetail', idKey: 'slash_no' },
```
GET 时用的是 `slash_no`，POST help 时用的是 `slash_id`，前后不一致。

**影响：** 帮砍操作的参数发到云函数时字段名错误，云函数若以 `slash_no` 接收则会找不到记录，导致帮砍功能失败或返回错误。

**修复建议：** 改为 `idKey: 'slash_no'`。

---

### 2. `pages/slash/detail.js` — 倒计时不实时更新（冻结显示）

**位置：** `pages/slash/detail.js` `loadDetail()` 方法内

**问题：**
`_remainHours`、`_remainMins`、`_remainSecs` 在 `loadDetail()` 时计算一次后写入 `data`，**没有启动任何 `setInterval` 来定时递减**。用户长时间停留在页面上看到的倒计时是静止的。只有切换页面再回来（触发 `onShow` → `loadDetail`）才会刷新。

**对比：** `pages/order/list.js` 对待付款订单倒计时启动了 `_startListCountdown()`，有定时刷新机制。

**影响：** 用户在砍价详情页看到的秒级倒计时永远不会变动，体验差。

**修复建议：** 在 `onLoad`/`onShow` 后启动一个 1 秒间隔的 timer，每秒递减 `_remainSecs`（满60进1至 `_remainMins`），在 `onHide`/`onUnload` 中清除。

---

## 中等问题（逻辑隐患或参数不匹配）

### 3. `pages/slash/list.js` Line 113 — 非标准成功码被判为成功

```js
if (res.code === 0 || res.code === 1) {
```

**问题：** 项目其他接口均以 `code === 0` 为唯一成功标志（见 `cloud.js` 第 31 行）。此处额外接受 `code === 1`，不清楚含义，可能把某些错误响应当成成功处理，进而导航到错误的砍价详情。

**修复建议：** 确认云函数 `slashStart` 是否会返回 `code: 1`，若无，改为 `if (res.code === 0)`。

---

### 4. `config/constants.js` — ORDER_STATUS_TEXT 缺少 `pending_review` 状态

**位置：** `config/constants.js` + `pages/order/list.js` 第 107 行

`order/list.js` 中的 `statusNeedsRefundCheck` 检查了 `'pending_review'`：
```js
const statusNeedsRefundCheck = !currentStatus || currentStatus === 'shipped'
    || currentStatus === 'completed' || currentStatus === 'pending_review';
```

但 `ORDER_STATUS` 和 `ORDER_STATUS_TEXT` 中均没有 `pending_review` 的定义，若后端实际返回该状态，`order.statusText` 会显示"未知状态"。

**修复建议：** 在 `ORDER_STATUS` 中补充 `PENDING_REVIEW: 'pending_review'`，并在 `ORDER_STATUS_TEXT` 中补充对应文案（如"待评价"或"待审核"），和后端确认含义。

---

### 5. `app.js` Line 46 — navBarHeight 计算可能偏小

```js
this.globalData.navBarHeight = menuButton.height || 44;
```

**问题：** `menuButton.height` 是右上角胶囊按钮自身高度（通常约 32px），不是完整自定义导航栏高度。导航栏总高度通常需要：
```
navBarHeight = menuButton.bottom - statusBarHeight
```
如果下游页面用 `navBarHeight` 来撑开页面内容区，会导致自定义导航栏与内容区重叠。

**实际影响：** 查阅了 `slash/detail.wxml`，WXML 中使用的是 `navTopPadding`（= `menuButton.top`）作为 nav-bar 的 `padding-top`，`navBarHeight` 本身在此页未直接使用，影响取决于其他页面的具体用法。建议全局搜索 `navBarHeight` 确认有无受影响的页面布局。

---

### 6. `pages/order/orderDetailData.js` Line 128 — 无效选项静默忽略

```js
post(`/orders/${orderId}/sync-wechat-pay`, {}, { showError: false, maxRetries: 0, timeout: 12000 })
```

`maxRetries` 和 `timeout` 传给了 `post()`，但这两个选项在 `request.js` → `callFn()` 的调用链中**未被解析和使用**。`callFn` 只接受 `showLoading`、`showError`、`preventDup` 三个选项，其余会被静默丢弃。

**影响：** 超时控制和重试逻辑失效。云函数可能在网络慢时无限等待（微信云函数默认超时为 30 秒）。

**修复建议：** 若需要超时控制，需在 `callFn` 中通过 `Promise.race` 增加超时逻辑，或在调用侧加 `Promise.race` 包装。

---

### 7. `utils/auth.js` — requireLogin 定义在 module.exports 之后

```js
module.exports = {          // 第 31 行
    login,
    getUserInfo,
    updateUserInfo,
    requireLogin            // 引用了下方才声明的函数
};

function requireLogin(...) { ... }  // 第 51 行
```

**问题：** `requireLogin` 通过函数声明提升（hoisting）在运行时是可用的，实际不会报错，但代码结构混乱，容易误导维护者，也与通常的 CommonJS 模块写法相悖。

**修复建议：** 将 `requireLogin` 函数定义移至 `module.exports` 之前。

---

## 代码质量问题（低优先级）

### 8. `pages/slash/list.js` — 变量名遮蔽（Variable Shadowing）

```js
async onStartSlash(e) {          // 外层 e 是事件对象
    ...
    } catch (e) {                // 内层 e 遮蔽了外层事件参数
        wx.showToast({ title: e?.message || '网络错误' });
    }
```

外层 `e` 是点击事件 `Event` 对象，内层 `catch(e)` 是错误对象，命名冲突。外层 `e` 在 try 之后不再使用，所以功能没有问题，但容易混淆。

**建议：** 将内层 catch 变量改为 `catch (err)`。

---

### 9. `pages/slash/detail.js` + `pages/group/detail.js` — 函数重复

`resolvePreferredSkuId()` 和 `plainSummary()` 在两个文件中完全相同。

**建议：** 提取到 `utils/activityHelper.js` 或已有的 `utils/helpers.js` 中统一维护。

---

### 10. `pages/slash/detail.wxml` Line 79 — 倒计时分/秒未补零

```xml
剩余 {{detail._remainHours}}小时{{detail._remainMins}}分{{detail._remainSecs}}秒
```

`_remainMins` 和 `_remainSecs` 是数字，不会自动补零。"5分7秒" 在视觉上不如 "5分07秒" 整洁。

**建议：** 在 JS 端生成格式化后的字符串，或用 WXS 函数做补零处理。

---

### 11. `pages/order/list.js` Line 260 — 列表倒计时精度偏低

```js
this._listCountdownTimer = setInterval(() => { ... }, 10000); // 10秒间隔
```

当待付款订单只剩几十秒时，倒计时文字每10秒才更新一次，误差最大9秒，体验较差（详情页通常1秒刷新一次）。

**建议：** 改为 1 秒间隔，或至少在剩余时间 < 60 秒时缩短为 1 秒。

---

## 总体评价

- 代码整体结构清晰，模块化程度高，工具函数封装合理（`request.js` / `cloud.js` / `errorHandler.js`）。
- 最需要修复的是第 1 条（slash help 参数名错误）和第 2 条（倒计时冻结），这两个直接影响用户可感知的功能。
- `request.js` 中路由表维护成本较高，随着接口增加容易出现类似第 1 条的参数名笔误，建议加注释或做单测。
- `invitePosterCore.js` 的 Canvas 绘制代码写得很完整，逻辑清晰，值得保留。
- 分销/砍价/拼团这套活动体系的整体前端逻辑链路是通的，页面间跳转参数（slash_no / group_no）基本一致，只有上述 POST help 路由有差异。
