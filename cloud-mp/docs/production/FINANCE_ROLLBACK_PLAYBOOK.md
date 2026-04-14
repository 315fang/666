# 资金域回滚剧本

## 原则
- 先冻结高风险操作，再回滚代码。
- 不允许先回滚代码再补账。

## 回滚顺序
1. 停用高风险入口：
   - 退款完成
   - 提现确认打款
   - 欠款处理
2. 运行资金审计，定位新增异常单。
3. 对异常单按类型处理：
   - 内部退款：回退到 `approved`
   - 货款不足：转欠款
   - 提现拒绝：回款并补流水
4. 再回滚代码版本。

## 必查集合
- `refunds`
- `orders`
- `users`
- `wallet_logs`
- `goods_fund_logs`
- `point_logs`
- `admin_audit_logs`

## 关键脚本
- `npm run repair:refund-reopen`
- `npm run audit:finance-firewall`
- `npm run audit:refunds`
