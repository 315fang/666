# OSS 统一资产 + 一键换肤 / 活动页面配置落地方案（结合本项目）

> 适配：本项目已使用阿里云 OSS（`ali-oss`，见 `backend/routes/admin/controllers/adminUploadController.js`），前端有完整设计令牌（`qianduan/app.wxss`）。目标：不用上 CDN，也能做到图片优化、一键换肤、一键活动更新/新增页面、样式调节。

## 1) OSS 资产策略（替代 CDN 图片优化）
- 统一路径：`oss://{bucket}/{env}/{module}/{yyyyMMdd}/{hash}.{ext}`，前缀区分 prod/stage。
- WebP/降质：用 OSS 处理参数，而非 CDN  
  `https://{bucket}.{endpoint}/{key}?x-oss-process=image/format,webp/quality,Q_70`
- 按宽度/设备裁剪：  
  `...image/resize,w_{width}/quality,Q_75`，`width` 取 `wx.getSystemInfoSync().windowWidth` 上限 750。
- LQIP 占位：后台上传时自动生成 `.../lqip/{hash}.jpg`（quality 10，blur 50），前端优先加载占位再淡入原图。
- 命名防缓存击穿：`{hash}_{w}w_q70.webp`；后端返回 `etag`，小程序本地 `If-None-Match`。

## 2) 一键换肤（后端驱动 + 令牌注入）
- 配置表：复用 `app_configs`，新增键：
  - `theme_active`: `"luxury"` / `"fresh"` / `"dark"`
  - `theme_tokens_{name}`: JSON，键与 `app.wxss` 里的令牌同名（如 `--luxury-gold`、`--text-primary` 等）。
  - `theme_assets_{name}`: JSON（背景图、插画、骨架图 OSS URL）。
- API：`GET /api/theme` 返回 `{ active, tokens, assets, version }`。版本号用于缓存。
- 前端注入（无需改样式文件）：在页面根容器加内联 style 绑定：
  ```wxml
  <view class="page" style="{{themeStyle}}">
    ...
  </view>
  ```
  ```js
  // 通用 mixin
  async loadTheme() {
    const res = await get('/theme');
    const tokens = res.data.tokens || {};
    const style = Object.entries(tokens).map(([k,v])=>`${k}:${v}`).join(';');
    this.setData({ themeStyle: style });
    wx.setStorageSync('themeVersion', res.data.version);
    wx.setStorageSync('themeStyle', style);
  }
  ```
  - 若离线/弱网，先用缓存的 `themeStyle` 回填，保证“秒换肤”。
  - Tokens 未定义时回退到 `app.wxss` 默认值，兼容老页面。

## 3) 活动/页面一键更新与新增
- 数据模型（可扩展 `home_sections` 思路）：
  - `pages`：`page_key`（如 `mid_autumn_2025`）、`title`、`status`、`schema_version`。
  - `page_sections`：`page_key`、`type`（banner/grid/tabs/coupon/timer/custom-rich）、
    `payload`（JSON，含样式、数据源、倒计时、跳转）。
  - `page_assets`：关联 OSS 资源（背景、插画、视频封面），含 `process` 字段存储优化参数。
  - `page_theme_override`：局部覆盖 theme token（如活动主色）。
- API：
  - `GET /api/pages/{page_key}` 返回 `sections[] + themeOverride + assets`。
  - `POST /admin/pages/publish`：写入/更新并触发缓存失效。
- 前端渲染：
  - 页面通用 `renderer` 根据 `type` 映射到已存在的组件（banner、grid、coupon、countdown）。未知 `type` 兜底为自定义富文本。
  - 路由：新增活动仅需在后台创建 `page_key`，无需发版；跳转使用 `/pages/activity/index?key=mid_autumn_2025`。
  - 样式调节：`payload.style` 允许配置圆角、间距、阴影强度；主题覆盖通过 `page_theme_override` 注入到 `themeStyle`。

## 4) 一键操作流
- 换肤：后台切换 `theme_active` → 写入 tokens → 清理 `/theme` 缓存 → 前端下次冷启动或手动下拉刷新即生效。
- 更新活动：编辑 `page_sections` + `page_assets` → `publish` → 失效 `/pages/{key}` 缓存 → 前端下次进入活动页即更新。
- 新增页面：后台创建新 `page_key` + 配置 sections → 配置导航/运营位跳转该 key → 无需代码改动。

## 5) 最小落地清单（建议按顺序执行）
1. 后端：补充 `/api/theme`、`/api/pages/:key`，并在 admin 里加主题/页面编辑界面（表单 + JSON 校验）。
2. 前端：在基础页面 mixin 中调用 `loadTheme`；活动页使用通用 renderer（复用现有区块组件）。
3. OSS：上传时同时生成 WebP/LQIP 版本并记录处理参数；启用 `Cache-Control: public, max-age=86400` + `ETag`。
4. 缓存：前端存 theme/page 版本号；接口返回 `version`，变更时触发前端刷新。
5. 埋点：在 `/theme`、`/pages/:key` 返回中附 `version`，前端上报 `theme_version`、`page_version`，便于灰度/回滚。

这样即可在现有 OSS 基础上，不改发布流程，实现一键换肤、一键活动更新/新增页面，以及图片优化全链路。 
