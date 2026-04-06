# 小程序架构

## 技术栈

- 微信原生小程序
- WXML / WXSS / Page

## 当前目录分层

- `pages/`: 页面
- `components/`: 组件
- `utils/`: 请求、导航、格式化与业务工具
- `config/`: 环境与常量配置
- `store/`: 本地状态辅助

## 当前主要问题

- 页面文件过大
- `app.js` 职责过重
- `utils/request.js` 负担过多横切逻辑
- 页面、组件、业务工具之间的领域边界还不够清晰

## 当前重点大文件

- `pages/user/user.js`
- `app.js`
- `pages/category/category.js`
- `pages/order/confirm.js`

## 当前判断

- 功能面已经很大
- 结构治理明显落后于功能增长
- 如果继续直接堆页面逻辑，后续维护会越来越痛苦

## 下一步重点

1. 拆 `pages/user/user.js`
2. 拆 `app.js`
3. 拆 `pages/category/category.js`
4. 拆 `pages/order/confirm.js`
5. 收口 `utils/request.js`
