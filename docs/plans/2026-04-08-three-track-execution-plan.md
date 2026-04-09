# 2026-04-08 三主线并行执行计划

## 1. 目标

本轮不是继续零散收口，而是并行推进三条长期主线：

1. CloudBase 正式环境导入
2. 正式支付闭环
3. 后台真实数据源切换

## 2. 为什么三条线可以并行

它们虽然彼此相关，但当前可拆成三个相对独立的工程面：

- CloudBase 导入线先解决“数据能不能正式落环境”
- 支付线先解决“支付接口结构和幂等能不能达标”
- 后台数据源线先解决“CloudRun 是否具备真实数据源切换能力”

当前不必串行做完的原因是：

- 它们的主改动目录可以分开
- 都还处在“工程准备 + 正式接入前收口”阶段
- 都不应假装真实环境已经接通

## 3. 当前并行边界

### 3.1 CloudBase 导入线

写入范围：

- [cloud-mp/scripts](C:\Users\21963\WeChatProjects\zz\cloud-mp\scripts)
- [cloud-mp/docs](C:\Users\21963\WeChatProjects\zz\cloud-mp\docs)
- [cloud-mp/package.json](C:\Users\21963\WeChatProjects\zz\cloud-mp\package.json)

当前目标：

- 导入准备检查
- 导入结果记录
- 形成正式环境导入前的标准执行入口

### 3.2 支付线

写入范围：

- [cloud-mp/cloudfunctions/payment](C:\Users\21963\WeChatProjects\zz\cloud-mp\cloudfunctions\payment)
- [cloud-mp/docs](C:\Users\21963\WeChatProjects\zz\cloud-mp\docs)
- [docs/internals](C:\Users\21963\WeChatProjects\zz\docs\internals)

当前目标：

- 环境配置口径
- 幂等更新
- 模拟支付与正式支付的清晰分界

### 3.3 后台数据源线

写入范围：

- [backend/cloudrun-admin-service/src](C:\Users\21963\WeChatProjects\zz\backend\cloudrun-admin-service\src)
- [backend/cloudrun-admin-service/docs](C:\Users\21963\WeChatProjects\zz\backend\cloudrun-admin-service\docs)
- [backend/cloudrun-admin-service/README.md](C:\Users\21963\WeChatProjects\zz\backend\cloudrun-admin-service\README.md)
- [backend/cloudrun-admin-service/package.json](C:\Users\21963\WeChatProjects\zz\backend\cloudrun-admin-service\package.json)

当前目标：

- provider / adapter 抽象
- 健康检查
- 真实数据源未接通时的显式报错

## 4. 当前状态

### 4.1 CloudBase 导入线

已进入“可执行准备”阶段：

- 已有导入前校验入口
- 已有导入结果记录入口
- 已有导入准备与结果文档

说明：

- 这不等于真实 CloudBase 已正式导入
- 真实环境导入仍需环境 ID、账号权限和最终执行

### 4.2 支付线

仍处于“模拟支付已收口，正式支付未接通”阶段。

当前要求：

- 不再继续扩模拟支付分支
- 优先把正式支付所需结构补清

### 4.3 后台数据源线

当前仍是：

1. `.runtime/overrides`
2. `cloudbase-seed`
3. `mysql/jsonl`

下一步要做的是把这种回退链，改造成更明确的数据源 provider。

## 5. 集成顺序

三条线虽然并行推进，但集成顺序仍建议固定为：

1. 合并 CloudBase 导入线结果
2. 合并支付线结果
3. 合并后台数据源线结果
4. 统一更新迁移进度与 backlog

## 6. 风险点

- 真实 CloudBase 环境仍未执行正式导入
- 正式支付仍缺真实配置
- 后台仍未直连真实 MySQL / CloudBase
- 三条线如果缺少规则文档同步，容易再次形成多套真相

## 7. 本计划的使用规则

1. 这份文档只记录三主线的并行推进边界和阶段。
2. 任一主线发生阶段变化，必须同步更新本文件。
3. 最终完成后，可将本文件转入阶段归档，但在当前执行期内它属于有效入口。
