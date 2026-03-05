# 管理后台

基于 Vue 3 + Element Plus + Vite 构建的现代化管理后台系统。

## 功能特性

- ✅ 管理员登录与权限控制
- ✅ 数据概览仪表板
- ✅ 商品管理（增删改查、上下架）
- ✅ 订单管理（查看、发货）
- ✅ 用户管理（角色管理）
- ✅ 提现审核
- ✅ 售后管理
- ✅ 系统设置

## 技术栈

- **框架**: Vue 3 (Composition API)
- **UI 组件库**: Element Plus
- **状态管理**: Pinia
- **路由**: Vue Router 4
- **构建工具**: Vite 5
- **HTTP 客户端**: Axios
- **图表**: ECharts 5

## 开发指南

### 1. 安装依赖

```bash
cd backend/admin-ui
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

开发服务器将在 `http://localhost:5173/admin/` 启动

**注意**: 开发环境下，API 请求会通过 Vite proxy 代理到 `http://localhost:3000`

### 3. 构建生产版本

```bash
npm run build
```

构建产物将输出到 `dist/` 目录

## 项目结构

```
admin-ui/
├── src/
│   ├── api/              # API 接口封装
│   ├── assets/           # 静态资源
│   ├── components/       # 公共组件
│   ├── layout/           # 布局组件
│   ├── router/           # 路由配置
│   ├── store/            # 状态管理
│   ├── utils/            # 工具函数
│   ├── views/            # 页面组件
│   │   ├── dashboard/    # 数据概览
│   │   ├── login/        # 登录页
│   │   ├── products/     # 商品管理
│   │   ├── orders/       # 订单管理
│   │   ├── users/        # 用户管理
│   │   ├── withdrawals/  # 提现管理
│   │   ├── refunds/      # 售后管理
│   │   └── settings/     # 系统设置
│   ├── App.vue           # 根组件
│   ├── main.js           # 入口文件
│   └── style.css         # 全局样式
├── index.html            # HTML 模板
├── vite.config.js        # Vite 配置
└── package.json          # 项目配置
```

## 登录凭证

首次使用需要先创建管理员账号：

```bash
cd backend
node scripts/create-admin.js
```

按照提示创建管理员账号后，即可使用该账号登录管理后台。

## 部署说明

### 开发环境

1. 确保后端服务运行在 `http://localhost:3000`
2. 运行 `npm run dev` 启动开发服务器
3. 访问 `http://localhost:5173/admin/`

### 生产环境

1. 运行 `npm run build` 构建生产版本
2. 构建产物在 `dist/` 目录
3. 后端 Express 已配置静态文件服务，指向 `admin-ui/dist/`
4. 启动后端服务后，访问 `http://localhost:3000/admin/` 即可

## API 接口

所有 API 请求的 baseURL 为 `/admin/api`，主要接口包括：

- `POST /login` - 管理员登录
- `GET /stats` - 获取统计数据
- `GET /products` - 获取商品列表
- `POST /products` - 创建商品
- `PUT /products/:id` - 更新商品
- `DELETE /products/:id` - 删除商品
- `GET /orders` - 获取订单列表
- `PUT /orders/:id/ship` - 订单发货
- `GET /users` - 获取用户列表
- `PUT /users/:id/role` - 更新用户角色
- `GET /withdrawals` - 获取提现列表
- `PUT /withdrawals/:id/approve` - 通过提现
- `PUT /withdrawals/:id/reject` - 拒绝提现
- `GET /refunds` - 获取售后列表
- `PUT /refunds/:id/approve` - 通过售后
- `PUT /refunds/:id/reject` - 拒绝售后

## 开发注意事项

1. **路由配置**: 所有路由都使用 `/admin/` 作为 base path
2. **权限控制**: 使用 JWT token 进行身份验证，token 存储在 localStorage
3. **请求拦截**: Axios 拦截器自动添加 Authorization header
4. **错误处理**: 统一的错误处理和消息提示
5. **响应格式**: 后端统一返回 `{ code, message, data }` 格式

## 常见问题

**Q: 登录后提示 401 错误？**  
A: 检查 JWT token 是否过期，或者后端 JWT_SECRET 配置是否正确

**Q: 图片上传失败？**  
A: 检查后端上传接口是否正常，以及文件大小是否超过限制

**Q: 开发环境 API 请求失败？**  
A: 确保后端服务已启动在 `http://localhost:3000`

## License

MIT
