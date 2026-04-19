# 管理后台

更新日期：2026-04-18

基于 Vue 3 + Vite + Pinia + Element Plus 的 CloudBase 管理后台前端。

## 1. 角色与边界

管理后台只负责：

- 管理页面渲染
- 管理操作发起
- 权限驱动的路由与菜单展示

管理后台不直接写数据库。所有正式管理写操作都应通过 `/admin/api/*` 进入 `cloudfunctions/admin-api`。

## 2. 当前技术栈

- Vue 3
- Vue Router 4
- Pinia
- Element Plus
- Axios
- ECharts
- Vite 5

## 3. 当前主要页面

路由真相源：`admin-ui/src/router/index.js`

当前主页面包括：

- 经营看板、财务看板、运营参数
- 商品管理、商品分类、拼团活动、限时商品、活动资源、优惠券
- 订单管理、自提门店、退款、押金订单、提现、佣金
- 用户管理、经销商、分支代理
- 内容资源、页面装修、素材管理、评论管理、群发消息
- 会员策略
- 管理员与权限、运维监控、操作日志

## 4. 本地开发

安装依赖：

```powershell
cd C:\Users\21963\WeChatProjects\zz\cloud-mp\admin-ui
npm install
```

启动开发服务器：

```powershell
npm run dev
```

默认会启动在 `http://localhost:5173/`，使用 hash 路由后访问后台。

## 5. API 约定

统一请求封装：`admin-ui/src/utils/request.js`

### 开发环境

- 默认代理目标：`http://127.0.0.1:3001`
- 可通过 `VITE_ADMIN_DEV_PROXY_TARGET` 覆盖

### 生产环境

- 正式后台入口：`https://jxalk.wenlan.store/admin/`
- 正式 API 入口：`https://jxalk.wenlan.store/admin/api`
- 不应把 `*.service.tcloudbase.com` 当作正式管理后台上传入口

## 6. 构建

```powershell
cd C:\Users\21963\WeChatProjects\zz\cloud-mp\admin-ui
npm run build
```

截至 2026-04-18，本地构建通过。

## 7. 登录与权限

- 登录态由 JWT 驱动
- token 存在 `localStorage`
- 路由守卫和菜单显示都受权限控制
- 当前权限判断以前端路由 meta 和后端 `admin-api` 校验共同生效

## 8. 开发注意事项

1. 前端不要直接拼数据库结构，优先复用现有 API 模块。
2. 页面权限名要和后端权限目录保持一致。
3. 管理端所有正式写操作都走 `admin-api`，不要引入绕行写数据库。
4. 生产构建要显式确认 `VITE_ADMIN_API_BASE_URL`。
5. 如果本地静态打开构建产物，登录 404 会尝试一次本地直连回退，但这只用于排障，不是正式部署方式。

## 9. 常见问题

### 登录后 401

- 检查 token 是否过期
- 检查 `ADMIN_JWT_SECRET` 是否稳定配置

### 本地请求失败

- 检查本地 `admin-api` 是否可从 `VITE_ADMIN_DEV_PROXY_TARGET` 访问
- 当前默认不是 `http://localhost:3000`，而是 `http://127.0.0.1:3001`

### 图片上传异常或 413

- 优先检查 `/admin/api/* -> admin-api` 的域名路由是否正确
- 再检查生产环境的 `VITE_ADMIN_API_BASE_URL`
