# CloudBase 迁移现状与边界

## 1. 迁移背景

当前仓库不是已经全面迁到 CloudBase，而是处于“双轨并行”阶段：

- 原正式系统：MySQL + Express + Vue 后台 + 微信原生小程序
- 迁移目标线：CloudBase 小程序云函数 + CloudRun 管理服务 + CloudBase 文档库模型

相关目录：

- [cloud-mp](C:\Users\21963\WeChatProjects\zz\cloud-mp)
- [backend/cloudrun-admin-service](C:\Users\21963\WeChatProjects\zz\backend\cloudrun-admin-service)

## 2. 当前迁移完成度

依据 [cloud-mp/docs/CLOUDBASE_MIGRATION_PROGRESS.md](C:\Users\21963\WeChatProjects\zz\cloud-mp\docs\CLOUDBASE_MIGRATION_PROGRESS.md)，当前整体完成度大约在 65% - 75%。

已完成的重点：

- 小程序 `wx.cloud` 基座已建立
- 核心云函数已建立
- CloudRun 管理后台骨架已建立
- 标准化 seed / import 中间层已建立
- 旧字段审计脚本已建立

未完成的重点：

- 正式支付闭环
- CloudBase 正式环境导入
- 后台真实数据源切换
- 图片 `file_id` 全量替换
- 页面层兼容清理

## 3. 当前 CloudBase 线的真实结构

### 3.1 小程序侧

目录：

- [cloud-mp/miniprogram](C:\Users\21963\WeChatProjects\zz\cloud-mp\miniprogram)
- [cloud-mp/cloudfunctions](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions)

核心云函数：

- `login`
- `user`
- `products`
- `cart`
- `order`
- `payment`
- `config`
- `distribution`

状态判断：

- 已经从“旧字段主导”进入“新字段优先、旧字段兼容”阶段
- 但还没有彻底完成页面层和正式数据层切换

### 3.2 后台侧

目录：

- [backend/cloudrun-admin-service](C:\Users\21963\WeChatProjects\zz\backend\cloudrun-admin-service)
- [admin-ui](C:\Users\21963\WeChatProjects\zz\admin-ui)

当前结构：

- `admin-ui` 继续保留现有 Vue 技术栈
- 当前正式后台入口定为 `admin-api` 云函数网关
- `cloudrun-admin-service` 保留为后续演进线，不作为本轮上线前置条件
- 后台数据已切到 CloudBase 读优先

状态判断：

- 后台主入口已可走 CloudBase 正式环境
- 但 `cloudrun-admin-service` 仍未云上部署

### 3.3 数据迁移中间层

目录：

- [cloud-mp/cloudbase-seed](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudbase-seed)
- [cloud-mp/cloudbase-import](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudbase-import)
- [cloud-mp/scripts](C:\Users\21963\WeChatProjects\zz\cloud-mp\scripts)

当前能力：

- MySQL 导出数据可被标准化
- 可生成 CloudBase 导入包
- 可做导入摘要校验
- 可做旧字段兼容审计

说明这条线已经有方法论，不再只是口头计划。

## 4. 当前迁移的核心收益

### 4.1 基础设施统一方向已经明确

目标结构已经比较清晰：

- 小程序侧业务走云函数
- 后台管理走 CloudRun
- 文档库承接标准化集合
- 云存储承接素材

### 4.2 数据标准化已经开始

最关键的是已经明确：

- `openid`
- `qty`
- `nickName`
- `avatarUrl`
- `file_id`

这些字段是目标口径。

### 4.3 兼容逻辑已经从“无意识”变成“显式可审计”

现在至少有：

- 字段映射文档
- 导入校验脚本
- 兼容审计脚本

这说明迁移已经进入可治理状态。

## 5. 当前迁移的最大问题

### 5.1 双真相并存

现在同时存在：

- MySQL 正式模型
- CloudBase 目标模型
- 页面兼容模型

这导致很多代码不得不写成双语兼容。

### 5.2 迁移并未真正完成“环境切换”

现在更多是：

- 数据包准备好了
- 云函数准备好了
- 后台底座准备好了

但真正的 CloudBase 环境导入、正式支付、正式读写切换还没完成。

### 5.3 页面层残留大量旧字段

根据迁移审计，页面层仍残留大量：

- `quantity`
- `image_url`
- `avatar_url`
- `nickname`
- `pending_ship`

这类历史字段。

## 6. 边界应该怎么划

### 6.1 当前必须继续迁的部分

- 用户侧核心交易链路
- 后台商品 / 内容 / 订单 / 素材管理
- 标准数据导入
- 正式支付

### 6.2 当前不要继续扩的部分

- 复杂营销活动
- 过深的分销规则
- 新的旧字段兼容层
- CloudBase 线之外的新并行实现

### 6.3 当前应视为“临时适配层”的部分

- 旧字段兼容读取
- seed / overrides 运行模式
- 页面层 `image_url` / `nickname` 等兼容展示

这些都不是长期资产。

## 7. 对迁移路线的判断

当前路线整体是对的：

1. 先标准化数据
2. 再建立 CloudRun 后台底座
3. 再清理小程序核心云函数
4. 最后切正式环境

这个顺序比“直接全量切库”稳很多。

## 8. 当前阶段最正确的目标

不是一次性把全项目都迁完，而是先完成三个闭环：

1. 交易闭环
2. 后台运营闭环
3. 图片素材闭环

只要这三条闭环落地，CloudBase 线就算真正成立。

## 9. 当前不该误判的两件事

1. `cloud-mp` 不是现网主系统，它是迁移主线。
2. 迁移不是失败了，而是已经越过“想法阶段”，进入“收尾阶段”。

## 10. 接手时的建议

1. 继续把 `cloud-mp` 视为目标工程，不要和原 `miniprogram` 混着理解。
2. 任何字段治理先看映射文档和迁移进度文档。
3. 在 CloudBase 正式环境导入之前，不要宣布迁移完成。
4. CloudBase 迁移的成功标志，不是代码写完，而是：
   - 正式环境导入完成
   - 正式支付可跑
   - 后台和小程序都读同一套标准模型
