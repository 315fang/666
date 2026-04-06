# 本地开发

## 环境要求

- Node.js
- MySQL
- 微信开发者工具（用于小程序）

## 后端

```powershell
cd backend
npm install
npm run dev
```

测试：

```powershell
cd backend
npm test
```

常用辅助命令：

```powershell
cd backend
npm run test:unit
npm run test:integration
npm run test:coverage
```

## 管理端

```powershell
cd admin-ui
npm install
npm run dev
```

构建验证：

```powershell
cd admin-ui
npm run build
```

## 小程序

1. 用微信开发者工具打开 `miniprogram/`
2. 配置本地环境参数
3. 保证后端服务可访问

## 当前约定

1. 后端测试统一使用 Jest。
2. 权限键以后端权限目录为准。
3. 开发前先看 `docs/README.md`、审计报告和任务清单。
