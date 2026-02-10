# 修复：微信小程序启动错误 - "process is not defined"

## 问题描述

在微信开发者工具中启动小程序时，出现以下错误：

```
app.js错误:
ReferenceError: process is not defined
    at VM118 env.js:19
    at VM70 WASubContext.js:1
...
Page "pages/index/index" has not been registered yet.
```

## 根本原因

这个错误是由**循环依赖**引起的模块加载问题：

1. **app.js** 在顶层导入 `require('./utils/auth')`
2. **utils/auth.js** 在顶层导入 `require('./request')`
3. **utils/request.js** 在顶层调用 `const app = getApp()`

当小程序启动时，执行顺序如下：
- 微信加载 `app.js`
- `app.js` 立即执行 `require('./utils/auth')`
- `auth.js` 立即执行 `require('./request')`
- `request.js` 尝试调用 `getApp()`
- ❌ 此时 `App()` 还未注册，导致错误

## 解决方案

### 修改 1: app.js - 延迟加载 auth 模块

**修改前**:
```javascript
// app.js 顶层
const { login } = require('./utils/auth');

App({
    // ...
    async wxLogin(distributorId = null) {
        const result = await login({...});
    }
});
```

**修改后**:
```javascript
// app.js - 移除顶层导入

App({
    // ...
    async wxLogin(distributorId = null) {
        // 在方法内部动态导入，此时 App() 已经注册
        const { login } = require('./utils/auth');
        const result = await login({...});
    }
});
```

**优点**:
- ✅ `auth` 模块只在需要时加载
- ✅ 此时 `App()` 已经注册完成
- ✅ 避免循环依赖问题

### 修改 2: utils/request.js - 移除顶层 getApp() 调用

**修改前**:
```javascript
// utils/request.js 顶层
const app = getApp();

const config = {
    baseUrl: 'https://api.jxalk.cn/api',
    timeout: 15000
};
```

**修改后**:
```javascript
// utils/request.js - 移除顶层变量

const config = {
    baseUrl: 'https://api.jxalk.cn/api',
    timeout: 15000
};

// getApp() 只在 401 错误处理时调用
function request(options) {
    // ...
    if (res.statusCode === 401) {
        const appInstance = getApp(); // 此时调用是安全的
        if (appInstance && appInstance.wxLogin) {
            appInstance.wxLogin().catch(() => {});
        }
    }
}
```

**优点**:
- ✅ 不在模块加载时调用 `getApp()`
- ✅ 只在需要时（401 错误）才获取 app 实例
- ✅ 此时 `App()` 必然已注册

## 技术原理

### 微信小程序模块加载机制

微信小程序使用 CommonJS 规范的模块系统：

1. **同步加载**: `require()` 是同步的，立即执行模块代码
2. **单次执行**: 每个模块只执行一次，结果被缓存
3. **循环依赖**: 当出现循环依赖时，返回部分导出的模块

### 为什么会出现 "process is not defined"？

虽然错误信息提示 `process is not defined`，但这是一个**误导性的错误消息**。真正的原因是：

1. 循环依赖导致模块加载失败
2. 微信开发者工具的编译器在处理错误时，产生了 `process` 相关的内部错误
3. `process` 是 Node.js 的全局对象，在小程序环境中不存在

实际上，错误的根源是**在 App() 注册之前调用 getApp()**。

## 最佳实践

### ✅ 正确做法

1. **延迟导入**: 在需要时才 `require()` 模块
```javascript
function myFunction() {
    const { someUtil } = require('./utils/someUtil');
    someUtil();
}
```

2. **避免顶层 getApp()**: 只在回调/方法中调用
```javascript
// ❌ 错误
const app = getApp();

// ✅ 正确
function doSomething() {
    const app = getApp();
}
```

3. **模块职责分离**: 减少模块间的相互依赖

### ❌ 应该避免

1. **顶层导入所有依赖**
```javascript
// ❌ 不推荐
const moduleA = require('./a');
const moduleB = require('./b');
const moduleC = require('./c');

// ✅ 推荐：按需导入
function useSomething() {
    const { needed } = require('./a');
}
```

2. **在模块顶层访问全局对象**
```javascript
// ❌ 错误
const app = getApp();
const currentPages = getCurrentPages();

// ✅ 正确
function myMethod() {
    const app = getApp();
}
```

## 测试验证

修复后，小程序应该能够正常启动，表现为：

- ✅ 没有 "process is not defined" 错误
- ✅ 没有 "Page has not been registered yet" 错误
- ✅ App() 正常初始化
- ✅ 所有页面可以正常注册和加载
- ✅ 登录功能正常工作

## 相关资源

- [微信小程序官方文档 - 模块化](https://developers.weixin.qq.com/miniprogram/dev/framework/app-service/module.html)
- [微信小程序官方文档 - App()](https://developers.weixin.qq.com/miniprogram/dev/reference/api/App.html)
- [CommonJS 模块规范](http://www.commonjs.org/specs/modules/1.0/)

## 总结

这个问题的核心是**模块加载时机**和**循环依赖**。通过将模块导入延迟到真正需要的时候，可以避免在 App() 注册之前调用 `getApp()` 等全局方法，从而解决启动错误。

这是微信小程序开发中的常见陷阱，理解模块加载机制对于避免类似问题至关重要。
