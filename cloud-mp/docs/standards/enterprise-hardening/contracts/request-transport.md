# 小程序请求传输契约

日期：2026-04-14

## 1. 范围

覆盖以下入口：

- `miniprogram/utils/request.js`
- `miniprogram/utils/cloud.js`
- `docs/audit/generated/MINIPROGRAM_ROUTE_TABLE_AUDIT.md`

本专题不定义业务字段真相，而定义：

- route 到云函数的映射规则
- `ROUTE_TABLE` 的受控扩展规则
- transport 层允许和禁止承载的职责

## 2. 当前现状

`miniprogram/utils/request.js` 目前承担双重角色：

1. transport adapter  
   把 REST 风格调用转成 `wx.cloud.callFunction`
2. 隐形接口契约中心  
   通过 `ROUTE_TABLE` 决定 `route -> fn -> action -> idKey`

这意味着页面层看到的是 REST，真实运行依赖的是 action-RPC。

## 3. 正式规则

### 3.1 必须可审计

以下映射必须始终可以从代码和脚本证据中确认：

- route
- HTTP method
- cloud function name
- action
- idKey

权威代码入口：

- `miniprogram/utils/request.js`

权威证据入口：

- `docs/audit/generated/MINIPROGRAM_ROUTE_TABLE_AUDIT.md`

### 3.2 request 层允许承担的职责

- 路由匹配
- 查询参数解析
- 调用 `wx.cloud.callFunction`
- 统一错误透传
- 上传调用封装

### 3.3 request 层禁止继续承担的职责

- 新增业务规则判断
- 新增字段兼容归一化
- 新增订单、用户、支付、配置的领域逻辑
- 新增页面级状态拼装

## 4. 新增 route 的准入规则

新增 route 时必须同时满足：

1. 对应业务契约已存在于专题 contract 文档中
2. `ROUTE_TABLE` 明确声明 `fn`、`action`、`idKey`
3. `npm run audit:miniprogram-routes` 通过
4. 如涉及新字段，先更新对应专题 contract，再更新页面调用

## 5. 当前高风险点

- `ROUTE_TABLE` 规模已经较大，维护成本高
- route 的存在与业务契约未完全一一对应
- 若继续往 request 层塞逻辑，会进一步恶化边界

## 6. 收口方向

本阶段不改外部 URL。  
收口顺序固定为：

1. 保留 `ROUTE_TABLE` 作为兼容映射
2. 加强 route 审计和文档映射
3. 先把业务字段收回各自 contract
4. 后续再考虑把 request 层降级为更纯的 transport

## 7. 验证

必须通过：

- `npm run audit:miniprogram-routes`
- 相关文件 `node --check`

涉及高频主链路时，还应补充：

- 登录
- 商品详情
- 下单
- 支付
- 退款
- 首页内容读取
