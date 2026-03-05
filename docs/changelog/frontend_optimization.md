# 小程序前端优化诊断与修复报告

本报告记录了对 `qianduan` 文件夹进行的系统性诊断及优化修复工作。主要目标是减少重复代码、统一业务逻辑并增强代码的可维护性。

## 1. 核心修复与优化项

### 统一商品数据格式化与价格计算
- **问题**：`cart.js`、`confirm.js` 和 `detail.js` 等页面均存在独立且重复的商品价格计算及图片解析逻辑。
- **修复**：
    - 在 [dataFormatter.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/utils/dataFormatter.js) 中新增并导出了 `processProduct` 和 `processProducts` 方法。
    - 统一了各页面对商品数据的处理流程，确保全站会员等级价格计算逻辑一致。

### 全局系统信息收敛
- **问题**：多个页面在 `onLoad` 时频繁调用 `wx.getSystemInfoSync()` 获取状态栏高度，造成不必要的性能开销和代码冗余。
- **修复**：
    - 在 [app.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/app.js) 的 `onLaunch` 生命周期中统一获取 `statusBarHeight`。
    - 存入 `globalData`，各页面直接引用，减少了系统 API 的调用频率。

### 统一错误处理机制
- **问题**：各页面错误提示方式不统一（有的用 `wx.showToast`，有的未处理），且缺乏统一的日志记录。
- **修复**：
    - 全面接入 [errorHandler.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/utils/errorHandler.js)。
    - 规范了业务错误和网络错误的提示风格，支持自定义消息覆盖，并预留了日志上报接口。

### 业务逻辑抽象与复用
- **问题**：地址加载及筛选等逻辑在多个业务场景中高度相似但代码分散。
- **修复**：
    - 创建了全新的 [address.js](file:///c:/Users/21963/WeChatProjects/zz/qianduan/utils/address.js) 工具类。
    - 封装了地址列表加载、默认地址获取及页面导航逻辑，大幅简化了 `confirm.js` 等页面的代码量。

## 2. 文件变更清单

- `qianduan/utils/dataFormatter.js`: 增强数据处理能力，导出统一接口。
- `qianduan/app.js`: 增加全局系统信息初始化逻辑。
- `qianduan/utils/address.js`: **(新增)** 抽象地址相关业务逻辑。
- `qianduan/pages/index/index.js`: 接入统一错误处理，优化状态栏获取。
- `qianduan/pages/cart/cart.js`: 接入 `processProducts` 统一商品渲染。
- `qianduan/pages/product/detail.js`: 移除重复的价格计算逻辑，接入统一格式化工具。
- `qianduan/pages/order/confirm.js`: 大幅重构，使用 `address.js` 简化地址处理流程。

## 3. 后续建议
- 继续推进 UI 组件化，将页面中重复的视图块（如订单项、用户卡片）拆分为 Component。
- 考虑引入轻量级状态管理方案，替代部分过于依赖 `globalData` 的场景。
