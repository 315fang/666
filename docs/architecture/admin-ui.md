# 管理端架构

## 技术栈

- Vue 3
- Vite
- Pinia
- Element Plus

## 当前目录分层

- `src/router/`: 路由与权限入口
- `src/store/`: 全局状态
- `src/api/`: 接口封装
- `src/views/`: 页面级视图
- `src/components/`: 通用组件
- `src/composables/`: 可复用逻辑
- `src/config/`: 共享配置、角色预设、菜单分组
- `src/utils/`: 请求层与工具函数

## 权限现状

- 路由 `meta.permission` 已完成首轮收口
- 角色默认权限已集中到 `src/config/adminRolePresets.js`
- 当前例外：`super_admin` 仍作为超级角色用于运维类入口

## 当前主要问题

- 大页面仍然过重
- 部分 API 封装和页面状态逻辑仍然分散

## 当前重点大文件

- `src/views/activities/index.vue`
- `src/views/settings/index.vue`
- `src/views/users/index.vue`

## 构建现状

- `npm run build` 当前通过
- 路由已经按页面懒加载
- 通过精简全量图标注册与放开 `element-plus` 强制合并后，构建大包警告已消失
- 当前较大的共享块已收敛到：
  - `vue-vendor` 约 108KB
  - `element-plus-icons` 约 44KB
  - `http-vendor` 约 37KB
- 结论：后续可以继续按页面体验优化 chunk，但不再需要为“清除 500KB 警告”做额外紧急处理

## 下一步重点

1. 拆 `activities/index.vue`
2. 拆 `settings/index.vue`
3. 拆 `users/index.vue`
4. 推进 `src/api/modules/` 与页面逻辑解耦
