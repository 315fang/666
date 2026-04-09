# CloudBase 迁移待办

日期：2026-04-09
状态：执行中

## 目标

将当前仓库从“`cloud-mp/` 中已有一套 CloudBase 迁移资产，但 `zz` 主干、真实运行入口、云环境验证仍未完全收口”的状态，收口到：

- 主干文档可作为唯一真相源
- 小程序主入口真实运行在 `wx.cloud`
- CloudBase 环境集合、云函数、后台链路可验证
- 支付链路不再依赖模拟分支
- 旧字段兼容逐步清空

## 当前已确认事实

- CloudBase 目标环境 `cloud1-9gywyqe49638e46f` 已可访问，且已有真实集合和云函数
- `cloud-mp/` 中已有迁移脚本、导入包、云函数、小程序云开发版入口
- `zz/miniprogram` 主干入口仍未切换到 `wx.cloud`
- `cloud-mp/docs/CLOUDBASE_ENV_IMPORT_RESULT.md` 仍停留在 `DRAFT/PENDING`
- 核心集合校验仍缺 `skus`、`admin_roles`
- CloudRun 管理服务代码存在，但云上未部署
- 支付代码仍存在模拟分支

## P0

- [x] 将 CloudBase 迁移待办纳入主干 `docs/` 真相源
- [x] 建立“本地导入包 vs 云上真实环境”的自动校验报告
- [x] 修正 `CLOUDBASE_ENV_IMPORT_RESULT.*`，使其反映真实环境状态，而不是永久 `DRAFT`
- [x] 补齐 CloudBase 核心集合缺口：`skus`、`admin_roles`
- [x] 将小程序运行时入口切回 CloudBase 主链路
- [x] 将主干小程序登录从 `wx.login + token` 切到 `wx.cloud.callFunction('login')`
- [x] 将主干小程序请求层从 `wx.request` 切到云函数路由层
- [x] 校验支付正式配置与正式证书文件路径
- [x] 移除 `simulation` 支付分支，仅保留 `formal / disabled`

## P1

- [x] 将 `cloud-mp/scripts/` 中有效迁移脚本纳入主干执行链路
- [x] 将 `cloud-mp/docs/` 中有效迁移文档纳入主干文档入口
- [x] 明确本轮后台正式入口为 `admin-api` 云函数网关；`cloudrun-admin-service` 保留为后续演进线
- [x] 本轮上线不以 CloudRun 管理服务部署为前置条件
- [x] 将后台数据源切为真实 CloudBase 读优先
- [x] 完成后台管理员链路对 `admin_roles` 的真实读取与验证
- [x] 清理后台空列表占位接口
- [x] 收口后台上传本地 fallback 标识，移除 `cloudbase://local/` 伪云文件路径

## P2

- [ ] 清理小程序展示层旧字段兼容：`image_url`、`avatar_url`、`nickname`
  当前已收口：用户资料页、首页昵称截断、分销邀请/海报/团队页统一走标准昵称头像 helper
- [ ] 清理后台页面旧字段兼容：`image_url`、`avatar_url`、`nickname`
  当前已收口：订单页、N 路径页、用户列表/详情页统一走 `admin-ui/src/utils/userDisplay.js`
- [ ] 清理仍依赖旧计数字段的 `quantity` 读取
- [ ] 收紧 `pending_ship` 兼容状态，只保留展示语义
- [ ] 治理分销模块的剩余 CloudBase 迁移债务
- [ ] 治理营销活动与素材 `file_id` 主引用收口
- [x] 归档 `cloud-mp` 注入/模拟脚本，避免继续作为主入口资产

## 执行顺序

1. 先修真相源：待办、运行态校验、导入结果报告
2. 再修环境缺口：核心集合、支付配置、云函数/后台部署状态
3. 再切主入口：小程序登录、请求层、配置加载
4. 最后清兼容层：旧字段、旧状态、旧图片引用

## 本轮起步动作

- [x] 新增运行态校验脚本
- [x] 生成 CloudBase 运行态报告
- [x] 重写导入结果报告为“包结果 + 运行态校验”
- [x] 以新报告为依据进入下一批代码修复
