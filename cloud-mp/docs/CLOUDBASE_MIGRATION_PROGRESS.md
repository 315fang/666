# CloudBase Migration Progress

## 当前阶段判断

按长期目标计算，当前整体迁移完成度大约在 **65% - 75%**。

已经完成的部分主要是：

- 小程序已基于 `wx.cloud` 运行
- 用户侧核心云函数已开始统一到新模型
- CloudRun 管理服务已成型
- 标准化 seed 生成链路已建立
- 后台已能读取标准化 seed
- 导入包校验脚本已建立
- 剩余旧字段审计脚本已建立
- 后台权限中间件已覆盖商品、订单、素材、设置和内容主模块

尚未完成的部分主要是：

- 正式支付接入与回调闭环
- CloudBase 正式导入与环境落库
- 后台真实数据源切换
- 分销/营销等剩余云函数治理
- 图片 `file_id` 全量替换

## 已完成事项

### 基础架构

- 安装 `cloudbase` skill
- 小程序确认使用 `wx.cloud.init`
- 后台新增 CloudRun 管理服务骨架
- `admin-ui` 已切换到可配置的 CloudRun API 基座

### 文档与模型

- 新增目标模型文档
- 新增 MySQL -> CloudBase 映射文档
- 明确 CloudBase 正式集合清单

### 后台管理服务

- 登录 / 资料 / 修改密码
- 商品管理
- 分类管理
- 素材库与上传接口
- Banner / 内容 / 日志
- 订单管理
- 统计 / 设置 / 小程序配置 / 告警配置
- 模块权限闭环（商品、素材、订单、设置、内容）
- `materials` / `banners` / `popup-ad-config` 已补 `file_id` 兼容输出

### 小程序云函数

- `login`
- `user`
- `products`
- `cart`
- `order`
- `payment`
- `config`

以上函数都已经改到“新字段优先，旧字段兼容读取”的阶段。

### 数据迁移中间层

- 新增 `scripts/normalize-cloudbase-data.js`
- 生成 `cloudbase-seed`
- 后台服务支持优先读取 `cloudbase-seed`
- 新增 `backend/cloudrun-admin-service/scripts/sync-from-cloudbase-seed.js`
- 新增 `scripts/validate-cloudbase-import.js`
- 新增 `scripts/audit-legacy-compat.js`
- 新增环境导入结果模板与兼容审计文档

## 当前未完成事项

### P0

- 正式支付下单配置收口
- 支付回调验签
- 支付幂等更新订单
- CloudBase 环境正式导入数据

### P1

- CloudRun 服务切真实 MySQL / CloudBase
- 图片素材改成 `file_id` 主引用
- 订单金额统一到“分”并去掉运行时双单位混用
- 小程序和后台页面层清理剩余 `image_url` / `avatar_url` / `nickname` 展示兼容

### P2

- 分销云函数治理
- 营销活动治理
- 后台权限细粒度校验

## 下一步推荐顺序

1. 生成可导入 CloudBase 的 JSONL 文件
2. 在目标环境导入标准化集合
3. 后台切到标准化数据主读
4. 接正式支付闭环并补齐支付环境变量
5. 清理剩余兼容逻辑
6. 执行 `npm run audit:legacy` 并按审计结果清理页面层旧字段
