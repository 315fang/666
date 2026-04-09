# 生产就绪清单

更新日期：2026-04-08

## 通过标准

只有当下面清单全部通过，项目才可以标记为“生产就绪”。

## P0 必须完成

- [ ] 小程序支付切到正式支付，不再使用模拟支付
- [ ] 支付回调完成验签与幂等校验
- [ ] 后台支付健康检测返回真实检查结果
- [ ] 物流查询接入真实供应商或真实轨迹源
- [ ] 后台上传在云函数环境完成真实 CloudBase 云存储联调
- [ ] Banner、素材、弹窗广告都以 `file_id` 为主字段工作
- [ ] 小程序订单页、退款页、地址页完成真机回归
- [ ] 后台用户、订单、退款、提现、佣金页面完成联调回归
- [ ] `GET /admin/api/users` 在线上函数网关下稳定返回，不再超时
- [ ] `dealers / branch-agents / n-system / admins / ops-monitor` 明确是否上线；不上线则菜单与接口一并下线
- [ ] 旧字段兼容清理到可控范围，不能再持续新增

## P1 建议完成

- [ ] 后台占位接口全部替换成真实响应或明确下线
- [ ] `dealers / branch-agents / n-system / admins / ops-monitor` 明确是否首发上线
- [ ] 注入脚本和模拟脚本确认归档或删除
- [ ] 后台运行日志、错误日志、关键告警有可观测入口
- [ ] 发布前执行一次 `npm run release:check`

## 发布前验收

- [ ] [docs/release/PRODUCTION_GAP_ANALYSIS.md](/C:/Users/21963/WeChatProjects/zz/docs/release/PRODUCTION_GAP_ANALYSIS.md) 已更新
- [ ] [docs/release/PRODUCTION_CHECK_REPORT.md](/C:/Users/21963/WeChatProjects/zz/docs/release/PRODUCTION_CHECK_REPORT.md) 已生成
- [ ] [docs/audit/2026-04-08-cloudbase-runtime-audit.md](/C:/Users/21963/WeChatProjects/zz/docs/audit/2026-04-08-cloudbase-runtime-audit.md) 已同步最新运行态
- [ ] 管理员测试账号已确认
- [ ] 测试环境和正式环境配置已分离

## 当前结论

截至 2026-04-08，本项目还未满足全部 P0 条件。
