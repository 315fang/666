# 内部退款回退脚本说明

## 脚本
- `npm run repair:refund-reopen`
- 文件：[repair-internal-refund-reopen.js](/C:/Users/21963/WeChatProjects/zz/cloud-mp/scripts/repair-internal-refund-reopen.js)

## 用途
- 将已错误完成的内部退款安全回退到 `approved`
- 补齐反向流水
- 在货款余额不足时转为显式欠款

## 输入与模式
- 默认：dry-run
- `--apply`：真正执行
- `--allow-goods-fund-debt`：允许货款不足时转欠款

## 执行条件
- 仅处理脚本白名单中的退款单
- 仅处理 `wallet` / `goods_fund`
- 仅处理当前退款状态为 `completed` 的记录

## 风险
- 若白名单错误，会导致误回退
- 若 live 数据被人工改动，dry-run 与 apply 间可能产生差异

## 回滚方式
- 使用脚本输出报告定位已修改退款单
- 对应退款单重新进入人工处理
- 若需要恢复余额，按流水和审计日志反向冲正
