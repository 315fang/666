# 本地阻断门槛

日期：2026-04-14

## 1. 使用规则

任何人声称“本轮规范化收口已完成”前，必须完成本文件全部门槛。  
任一门槛失败，都不能视为完成。

## 2. 合同审计

以下命令必须全部通过：

```powershell
npm run audit:order-contract
npm run audit:user-distribution-contract
npm run audit:config-content-contract
npm run audit:miniprogram-routes
npm run audit:order-fields
npm run audit:response-shape
```

证据输出：

- `docs/ORDER_MAIN_CONTRACT_AUDIT.md`
- `docs/USER_DISTRIBUTION_CONTRACT_AUDIT.md`
- `docs/audit/generated/CONFIG_CONTENT_CONTRACT_AUDIT.md`
- `docs/audit/generated/MINIPROGRAM_ROUTE_TABLE_AUDIT.md`
- `docs/audit/generated/ADMIN_RESPONSE_SHAPE_AUDIT.md`

## 3. 构建与静态检查

### 3.1 管理后台构建

```powershell
cd admin-ui
npm run build
```

要求：

- 构建成功
- 无新增构建错误
- 现有 warning 如未清除，必须在 repair 文档中说明

### 3.2 关键 JS 语法检查

要求：

- 所有本轮修改的云函数 JS
- 所有本轮修改的小程序关键 JS

执行：

```powershell
node --check <file>
```

## 4. 主链 smoke

至少验证以下链路：

- 登录
- 首页配置加载
- 购物车下单
- 直购下单
- 微信支付
- 货款支付
- 退款申请
- 退款取消或完成
- 发货与物流回填
- 分销中心
- 钱包
- 首页内容位读取

执行结果必须落入对应 repair 文档或单独 smoke 报告。

## 5. 文档一致性检查

必须同时成立：

- 规范文档和最新审计结果一致
- repair 文档引用的字段语义与专题 contract 一致
- 最终交付文档中记录的完成度与真实代码状态一致

## 6. 通过定义

只有当以下条件同时满足时，本地阻断门槛才算通过：

- 合同审计全绿
- 构建成功
- 相关 `node --check` 成功
- 本轮主链 smoke 已记录
- repair 文档已补
- `final-delivery.md` 已更新
