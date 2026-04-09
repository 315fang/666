# Document Governance Rules

## 1. 目的

本规则用于保证项目文档不是“写完即死”，而是持续参与协作和开发。

核心目标：

1. 让关键文档真正进入工作流
2. 让高风险改动自动触发文档更新
3. 防止项目再次回到“代码、文档、聊天三套真相并存”的状态

## 2. 核心文档集合

当前认定的最小必要文档集合为 **30 份**。

分层如下：

- 入口层：3 份
- 审计与计划层：2 份
- 结构层：4 份
- 内部实现层：10 份
- 规则层：3 份
- 操作规范层：2 份
- CloudBase 迁移层：6 份

文档清单与作用见：

- [docs/architecture/必要文档清单与维护策略.md](C:\Users\21963\WeChatProjects\zz\docs\architecture\必要文档清单与维护策略.md)

## 3. 使用规则

### 3.1 开始工作前必须读什么

#### 改订单、支付、退款

必须先读：

- [docs/internals/订单交易主链路梳理.md](C:\Users\21963\WeChatProjects\zz\docs\internals\订单交易主链路梳理.md)
- [docs/internals/订单支付售后状态枚举表.md](C:\Users\21963\WeChatProjects\zz\docs\internals\订单支付售后状态枚举表.md)
- [docs/internals/支付闭环说明.md](C:\Users\21963\WeChatProjects\zz\docs\internals\支付闭环说明.md)
- [docs/rules/core-business-rules.md](C:\Users\21963\WeChatProjects\zz\docs\rules\core-business-rules.md)

#### 改分销、佣金、提现、钱包

必须先读：

- [docs/internals/分销与佣金逻辑梳理.md](C:\Users\21963\WeChatProjects\zz\docs\internals\分销与佣金逻辑梳理.md)
- [docs/internals/分销资金流水说明.md](C:\Users\21963\WeChatProjects\zz\docs\internals\分销资金流水说明.md)
- [docs/rules/core-business-rules.md](C:\Users\21963\WeChatProjects\zz\docs\rules\core-business-rules.md)

#### 改后台模块、管理接口、后台权限

必须先读：

- [docs/architecture/后台模块与接口总览.md](C:\Users\21963\WeChatProjects\zz\docs\architecture\后台模块与接口总览.md)
- [docs/internals/后台页面与API映射表.md](C:\Users\21963\WeChatProjects\zz\docs\internals\后台页面与API映射表.md)
- [docs/internals/权限与角色模型总览.md](C:\Users\21963\WeChatProjects\zz\docs\internals\权限与角色模型总览.md)

#### 改小程序页面、接口映射、云函数对接

必须先读：

- [docs/internals/小程序页面与核心接口对照.md](C:\Users\21963\WeChatProjects\zz\docs\internals\小程序页面与核心接口对照.md)
- [docs/internals/字段兼容清理清单.md](C:\Users\21963\WeChatProjects\zz\docs\internals\字段兼容清理清单.md)

#### 改图片、素材、Banner、首页装修

必须先读：

- [docs/guides/图片素材字段规范.md](C:\Users\21963\WeChatProjects\zz\docs\guides\图片素材字段规范.md)
- [docs/internals/字段兼容清理清单.md](C:\Users\21963\WeChatProjects\zz\docs\internals\字段兼容清理清单.md)

#### 改 CloudBase 迁移、字段映射、导入脚本

必须先读：

- [docs/internals/CloudBase迁移现状与边界.md](C:\Users\21963\WeChatProjects\zz\docs\internals\CloudBase迁移现状与边界.md)
- [cloud-mp/MYSQL_TO_CLOUDBASE_MAPPING.md](C:\Users\21963\WeChatProjects\zz\cloud-mp\MYSQL_TO_CLOUDBASE_MAPPING.md)
- [cloud-mp/docs/CLOUDBASE_MIGRATION_PROGRESS.md](C:\Users\21963\WeChatProjects\zz\cloud-mp\docs\CLOUDBASE_MIGRATION_PROGRESS.md)
- [docs/guides/数据修复脚本索引.md](C:\Users\21963\WeChatProjects\zz\docs\guides\数据修复脚本索引.md)

## 4. 更新触发器

以下改动发生时，必须同步更新对应文档。

### 4.1 订单状态、支付状态、售后状态变化

必须更新：

- 订单主链路文档
- 订单支付售后状态枚举表
- 支付闭环说明
- 业务规则文档

### 4.2 佣金规则、钱包规则、升级规则变化

必须更新：

- 分销与佣金文档
- 分销资金流水说明
- 业务规则文档

### 4.3 页面改造导致接口依赖变化

必须更新：

- 小程序页面与核心接口对照

### 4.4 字段口径变化

必须更新：

- 字段兼容清理清单
- CloudBase 映射文档

### 4.5 CloudBase 迁移阶段变化

必须更新：

- 迁移进度文档
- 迁移 backlog
- 环境导入结果模板或结果记录
- 数据修复脚本索引（若新增或替换标准脚本链）

### 4.6 权限名、角色模型、后台模块边界变化

必须更新：

- 权限与角色模型总览
- 后台模块与接口总览
- 后台页面与API映射表

### 4.7 图片字段、素材引用、访问 URL 规则变化

必须更新：

- 图片素材字段规范
- 字段兼容清理清单

## 5. 角色责任

### 5.1 改代码的人负责改文档

默认规则：

- 谁改了高风险域代码，谁同步更新对应文档

### 5.2 做架构判断的人负责补说明

如果一次讨论已经影响：

- 模块边界
- 数据口径
- 长期迁移路线

就必须把结论落到仓库，不允许只留在聊天里。

## 6. 文档失效处理

如果发现文档失效：

1. 先标记冲突点
2. 查代码真相
3. 立即更新或归档旧文档

不允许：

- 继续引用明知错误的文档
- 先靠口头说明凑合，之后再说

## 7. 长期原则

项目的高价值知识应优先存在于仓库文档，而不是：

- 聊天记录
- 临时备注
- 个人记忆
- 散落截图

这条规则长期有效。
