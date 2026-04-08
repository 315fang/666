# 本次对话要点（结合现有项目文件）

## 现状与依托
- 前端设计令牌已在 `qianduan/app.wxss` 定义（luxury 主题）。
- 后端已接入阿里云 OSS（`backend/routes/admin/controllers/adminUploadController.js` 引用 `ali-oss`）。
- 文档侧已有全链路优化与 OSS 方案：
  - `docs/guides/WX_MINIPROGRAM_FULLCHAIN_OPTIMIZATION_22.md`
  - `docs/guides/OSS_THEME_ACTIVITY_BLUEPRINT.md`

## 图片与 OSS 策略（无 CDN 也可优化）
- OSS 处理参数：`?x-oss-process=image/format,webp/quality,Q_70/resize,w_{width}`，`width` 取设备宽（上限 750）。
- LQIP 占位：上传时生成低质模糊版；前端先渲染占位再淡入原图。
- 命名防缓存击穿：`{hash}_{w}w_q70.webp`；返回 `ETag` + 前端带 `If-None-Match`。

## 一键换肤（后端驱动）
- 配置表新增键：`theme_active`，`theme_tokens_{name}`（与 WXSS 令牌同名），`theme_assets_{name}`（背景/插画）。
- API：`GET /api/theme` → `{ active, tokens, assets, version }`；前端缓存 `themeStyle` 与 `themeVersion`。
- 注入方式：在页面根容器绑定内联 `style`（tokens 展平成 `--var:value;`），离线先用缓存。

## JSON 驱动新增/重绘页面
- 核心接口：`GET /api/pages/{page_key}` 返回 `sections[] + theme_override + version`；后台 `POST /admin/pages/publish` 失效缓存。
- 渲染约定：`type` → 组件映射（banner/grid/product_list/coupon/countdown/rich_text 等）；未知 `type` 兜底 `rich_text`。
- 样式白名单：`style` 仅允许圆角、间距、阴影、背景、对齐等安全字段。
- 推荐 Schema 示例（节选）：
```json
{
  "page_key": "mid_autumn_2025",
  "schema_version": "1.0",
  "theme_override": { "--color-primary": "#B5812A" },
  "sections": [
    { "id": "hero", "type": "banner", "payload": { "items": [{ "image": "...webp", "lqip": "...jpg" }] }, "style": { "radius": 24 } },
    { "id": "products", "type": "product_list", "payload": { "data_source": "/api/products?tag=mid_autumn_2025" } }
  ],
  "version": "2025-08-01T10:00:00Z"
}
```

## 运营一键操作流
- 换肤：后台切换 `theme_active` → 清缓存 → 前端冷启动/下拉即生效。
- 更新活动：编辑 `page_sections`/`page_assets` → 发布 → `/pages/{key}` 缓存失效 → 前端进入即更新。
- 新增页面：创建新 `page_key` + sections → 配置跳转到该 key，无需发版。

## 测试
- 根目录 `npm test` 不存在脚本；当前无自动化测试可跑。
