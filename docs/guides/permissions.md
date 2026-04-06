# 权限说明

## 当前原则

管理端权限应以**后端权限目录**为准，前端只做消费与展示，不应再维护一套独立真相。

后端权限目录：

- [`backend/config/adminPermissionCatalog.js`](/C:/Users/21963/WeChatProjects/zz/backend/config/adminPermissionCatalog.js)

## 当前正式权限键

- `dashboard`
- `products`
- `orders`
- `logistics`
- `pickup_stations`
- `users`
- `distribution`
- `content`
- `notification`
- `materials`
- `withdrawals`
- `refunds`
- `commissions`
- `dealers`
- `statistics`
- `settings_manage`
- `logs`
- `admins`
- `order_amount_adjust`
- `order_force_cancel`
- `order_force_complete`
- `user_balance_adjust`
- `user_role_manage`
- `user_parent_manage`
- `user_status_manage`

## 特殊角色

- `super_admin` 是角色，不是普通权限键。
- `super_admin` 默认拥有全部权限。
- 当前仍有少量只允许超级管理员访问的后台入口：
  - 运维调试路由 `/admin/api/debug/*`
  - 代理体系里的高风险执行接口（如分红执行、退出审核）
  - 管理端页面 `ops-monitor`

## 兼容说明

为兼容历史数据，后端中间件当前仍保留以下别名归一化：

- `settlements` -> `commissions`
- `settings` -> `settings_manage`
- `system` -> `settings_manage`

说明：

- 这些别名仅用于兼容旧数据
- 新代码、新文档、新权限配置不应继续使用这些别名

## 共享常量评估结论

当前不把权限键直接抽成前后端共享运行时代码常量，原因是：

1. 仓库是多端混合结构，直接共享运行时代码会扩大构建边界
2. 目前最需要的是“唯一目录 + 文档约束”，不是新增共享包
3. 后端权限目录已经是唯一真相源，前端当前只需消费正式键

当前决定：

- 继续以后端权限目录为真相源
- 前端通过共享配置和路由元信息消费正式键
- 若后续建立 `shared/` 层，再评估导出只读常量映射

## alias 兼容层移除策略

当前决定：

1. 兼容层只作为过渡措施保留
2. 新代码禁止继续写入 alias
3. 下一个权限数据清理窗口结束后，移除后端 alias 兼容层

移除前提：

- 数据库中不再存在 `settlements` / `settings` / `system` 旧键
- 管理端路由和角色预设已复核完成
- 权限相关测试已覆盖正式键路径

执行原则：

- 本轮收口之后不再新增 alias
- 后续若发现旧键，先做数据修复，不继续扩展兼容表

## 前端约定

1. 路由 `meta.permission` 使用正式权限键。
2. 管理端角色默认权限通过共享配置维护，不再在多个页面重复定义。
3. 需要新增权限时，先改后端目录，再改前端消费层。
4. `群发消息` 页面使用 `notification`，不能再挂到 `content`。
