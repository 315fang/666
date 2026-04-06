# 后端流程入口

## 本地开发

```powershell
cd backend
npm install
npm run dev
```

说明：

- 启动入口以 `backend/server.js` 为准
- 启动编排集中在 `backend/services/StartupService.js`
- 中间件与路由装配在 `backend/app.js`

## 测试

```powershell
cd backend
npm test
```

规则：

1. 后端测试统一使用 Jest
2. 新增测试默认进入 `backend/__tests__/`
3. 订单、支付、退款、权限改动优先补测试
4. 路由权限测试优先用 `supertest + express` 方式覆盖真实中间件挂载，不再只测纯函数

## 发布前检查

至少执行：

```powershell
cd backend
npm test
```

并人工确认：

1. 环境变量完整
2. 支付密钥和回调地址正确
3. 权限目录与前端权限键一致
4. 本轮关键链路已做回归验证

## 后台路由边界

- `backend/routes/admin/index.js` 只做聚合注册，不再重新塞回子域细节
- `backend/routes/admin/debug.js` 独立维护运维调试能力，由 `super_admin` 护栏保护
- `backend/routes/admin/env-check.js` 独立维护环境检查能力，避免和普通配置路由混杂
- `backend/routes/admin/mass-message.js` 独立维护群发消息域，后续继续按子域演进

## 运行真相源

- [`backend/server.js`](/C:/Users/21963/WeChatProjects/zz/backend/server.js)
- [`backend/services/StartupService.js`](/C:/Users/21963/WeChatProjects/zz/backend/services/StartupService.js)
- [`backend/app.js`](/C:/Users/21963/WeChatProjects/zz/backend/app.js)

## 仓库边界

主仓库默认只保留：

- 源码
- 配置
- 当前有效文档

以下内容不再视为项目资产：

- `.agent/`
- `.opencode/`
- `.worktrees/`
- `skill/`
- 日志、压缩包、数据库快照、上传产物、本地工具缓存

如确需保留历史资料，应进入 `docs/archive/` 或仓库外独立归档，不再直接混在主结构中。
