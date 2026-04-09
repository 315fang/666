# Project Collaboration Rules

## 1. 目的

本规则用于约束后续所有人类协作与 AI 协作行为。

目标不是写漂亮文档，而是降低项目继续失控的概率，保证后续改动都服务于长期维护。

## 2. 真相源原则

任何时候都必须区分三类真相源：

### 2.1 现网主系统真相

以以下目录和其当前代码为准：

- [backend](C:\Users\21963\WeChatProjects\zz\backend)
- [admin-ui](C:\Users\21963\WeChatProjects\zz\admin-ui)
- [miniprogram](C:\Users\21963\WeChatProjects\zz\miniprogram)

### 2.2 CloudBase 迁移目标真相

以以下目录和文档为准：

- [cloud-mp](C:\Users\21963\WeChatProjects\zz\cloud-mp)
- [cloud-mp/MYSQL_TO_CLOUDBASE_MAPPING.md](C:\Users\21963\WeChatProjects\zz\cloud-mp\MYSQL_TO_CLOUDBASE_MAPPING.md)
- [cloud-mp/docs/CLOUDBASE_MIGRATION_PROGRESS.md](C:\Users\21963\WeChatProjects\zz\cloud-mp\docs\CLOUDBASE_MIGRATION_PROGRESS.md)

### 2.3 项目文档真相

项目结构、边界、规则以 [docs](C:\Users\21963\WeChatProjects\zz\docs) 为准。

如果代码与文档冲突：

1. 先找较新的、已验证的一方
2. 在同一轮把另一侧同步
3. 不允许明知冲突还放着不管

## 3. 当前工作目标

当前阶段的第一目标不是加功能，而是恢复项目可信度。

优先级顺序固定为：

1. 统一真相源
2. 清理旧兼容
3. 修复高风险链路
4. 补充可交接文档
5. 最后才是新增功能

## 4. 文档规则

### 4.1 什么值得写进文档

只要满足以下任一条件，就值得写文档：

- 跨模块理解成本高
- 业务规则复杂
- 后续容易反复问同一个问题
- 会影响多人协作
- 会影响 AI 对项目的判断
- 属于迁移、权限、支付、订单、佣金、素材这类高风险域

### 4.2 文档不该写什么

不要写这些内容：

- 空泛总结
- 没有代码依据的猜测
- 过时计划冒充现行规则
- 一次性聊天结论却不落到仓库

### 4.3 文档放置规则

- 结构与系统说明放 `docs/architecture`
- 规则与边界放 `docs/rules`
- 深层实现梳理放 `docs/internals`
- 操作说明放 `docs/guides`
- 生产差距与发布清单放 `docs/release`
- 历史资料放 `docs/archive`

项目必要文档集合与治理方式见：

- [docs/architecture/必要文档清单与维护策略.md](C:\Users\21963\WeChatProjects\zz\docs\architecture\必要文档清单与维护策略.md)
- [docs/rules/document-governance-rules.md](C:\Users\21963\WeChatProjects\zz\docs\rules\document-governance-rules.md)

高风险域的专项文档还包括：

- [docs/internals/订单支付售后状态枚举表.md](C:\Users\21963\WeChatProjects\zz\docs\internals\订单支付售后状态枚举表.md)
- [docs/internals/支付闭环说明.md](C:\Users\21963\WeChatProjects\zz\docs\internals\支付闭环说明.md)
- [docs/internals/分销资金流水说明.md](C:\Users\21963\WeChatProjects\zz\docs\internals\分销资金流水说明.md)
- [docs/internals/后台页面与API映射表.md](C:\Users\21963\WeChatProjects\zz\docs\internals\后台页面与API映射表.md)
- [docs/guides/图片素材字段规范.md](C:\Users\21963\WeChatProjects\zz\docs\guides\图片素材字段规范.md)
- [docs/guides/数据修复脚本索引.md](C:\Users\21963\WeChatProjects\zz\docs\guides\数据修复脚本索引.md)
- [docs/release/PRODUCTION_GAP_ANALYSIS.md](C:\Users\21963\WeChatProjects\zz\docs\release\PRODUCTION_GAP_ANALYSIS.md)
- [docs/release/PRODUCTION_READINESS_CHECKLIST.md](C:\Users\21963\WeChatProjects\zz\docs\release\PRODUCTION_READINESS_CHECKLIST.md)

## 5. 代码改动规则

### 5.1 先判断属于哪条线

任何改动前都要先判断它属于：

- 现网主系统修复
- CloudBase 迁移线
- 文档与治理线

禁止三条线混着写，不标边界。

### 5.2 禁止继续扩大兼容层

以下旧字段只允许继续被清理，不允许新增回流：

- `buyer_id`
- `user_id`
- `quantity`
- `product_skus`
- `nickname`
- `avatar_url`
- `image_url`

图片素材新增规则：

- 历史 COS / 外链资产允许兼容读取
- 新上传图片必须优先进入 CloudBase 云存储
- 默认不允许把新增运营素材写回本地兜底目录

如果必须兼容，只能写在迁移脚本或临时适配层，不允许当成新标准。

### 5.3 禁止向上帝模块继续堆职责

尤其禁止继续把新职责塞进：

- 超大 controller
- 超大 page
- 超大 request util
- 单文件管理整条业务链的 service

遇到高复杂度逻辑，优先拆出独立 service / helper / 文档。

## 6. 业务高风险域

以下域的任何改动，都必须同步审查文档或补文档：

- 订单
- 支付
- 佣金
- 钱包
- 提现
- 活动价格
- 图片素材
- 权限
- CloudBase 数据迁移
- 生产发布

原因很简单：这些域不是页面小调整，而是会引发连锁副作用。

## 7. AI 协作规则

### 7.1 AI 不能只回答，不落仓库

如果一次讨论对项目长期有帮助，就要优先落成仓库里的 `.md`。

### 7.2 AI 不能把旧文档当真相

所有 AI 协作都应先检查：

- [README.md](C:\Users\21963\WeChatProjects\zz\README.md)
- [CLAUDE.md](C:\Users\21963\WeChatProjects\zz\CLAUDE.md)
- [docs/README.md](C:\Users\21963\WeChatProjects\zz\docs\README.md)

然后再进入具体子文档。

### 7.3 AI 不能用“可能”代替取证

只要仓库里可验证，就先读代码、读文档、读结构，再下结论。

### 7.4 AI 改高风险域必须同步补文档

以下域一旦被改动，默认就要检查对应文档是否同步：

- 订单
- 支付
- 佣金
- 钱包
- 权限
- 字段兼容
- CloudBase 迁移
- 图片素材
- 后台页面与接口映射
- 发布清单

## 8. 长期目标

长期目标不是“重写”，而是做到这四件事：

1. 单一真相源
2. 可交接结构
3. 可验证的核心链路
4. 可持续迁移到 CloudBase

## 9. 当前推荐阅读顺序

新接手项目时，建议按这个顺序读：

1. [README.md](C:\Users\21963\WeChatProjects\zz\README.md)
2. [docs/audit/2026-04-06-repo-audit.md](C:\Users\21963\WeChatProjects\zz\docs\audit\2026-04-06-repo-audit.md)
3. [docs\architecture\项目业务总览.md](C:\Users\21963\WeChatProjects\zz\docs\architecture\项目业务总览.md)
4. [docs\architecture\数据库与核心模型总览.md](C:\Users\21963\WeChatProjects\zz\docs\architecture\数据库与核心模型总览.md)
5. [docs\internals\订单交易主链路梳理.md](C:\Users\21963\WeChatProjects\zz\docs\internals\订单交易主链路梳理.md)
6. [docs\internals\分销与佣金逻辑梳理.md](C:\Users\21963\WeChatProjects\zz\docs\internals\分销与佣金逻辑梳理.md)
7. [docs\internals\CloudBase迁移现状与边界.md](C:\Users\21963\WeChatProjects\zz\docs\internals\CloudBase迁移现状与边界.md)
