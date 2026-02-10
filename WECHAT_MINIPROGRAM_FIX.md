# WeChat Mini Program Environment Fix

## Issue Summary

**Error**: `ReferenceError: process is not defined`
**Location**: `/qianduan/config/env.js:19`
**Impact**: Prevented mini program from loading, blocked all pages and components
**Date Fixed**: 2026-02-10

## Root Cause

The WeChat mini program environment does not support Node.js globals like `process`. The code was attempting to access `process.env.NODE_ENV`, which works in Node.js but fails in the WeChat mini program runtime.

### Problematic Code (Before)
```javascript
// Line 14 in config/env.js
const CURRENT_ENV = process.env.NODE_ENV || ENV_TYPES.DEVELOPMENT;
```

### Error Stack Trace
```
ReferenceError: process is not defined
    at VM92 env.js:19
    at VM59 WASubContext.js:1
    at f.runWith (VM59 WASubContext.js:1)
    at q (VM59 WASubContext.js:1)
    at n (VM59 WASubContext.js:1)
    at VM107 request.js:13
```

## Solution

### Fixed Code (After)
```javascript
// 当前环境配置
// WeChat小程序不支持process.env，这里手动配置环境
// 部署时修改此值：开发环境用 DEVELOPMENT，生产环境用 PRODUCTION
const CURRENT_ENV = ENV_TYPES.DEVELOPMENT;
```

### Key Changes
1. **Removed Node.js dependency**: Eliminated `process.env.NODE_ENV` reference
2. **Simple constant**: Used plain JavaScript constant for environment configuration
3. **Clear documentation**: Added comments explaining how to switch environments
4. **Manual control**: Developers explicitly set environment before deployment

## Environment Configuration

### Available Environments
The `/qianduan/config/env.js` file supports three environments:

#### 1. Development (`ENV_TYPES.DEVELOPMENT`)
```javascript
const CURRENT_ENV = ENV_TYPES.DEVELOPMENT;
```
- **API**: `https://dev-api.jxalk.cn/api`
- **CDN**: `https://dev-cdn.jxalk.cn`
- **Debug**: Enabled
- **Logging**: Enabled
- **Version**: `2.0.0-dev`

#### 2. Staging (`ENV_TYPES.STAGING`)
```javascript
const CURRENT_ENV = ENV_TYPES.STAGING;
```
- **API**: `https://staging-api.jxalk.cn/api`
- **CDN**: `https://staging-cdn.jxalk.cn`
- **Debug**: Enabled
- **Logging**: Enabled
- **Version**: `2.0.0-rc`

#### 3. Production (`ENV_TYPES.PRODUCTION`)
```javascript
const CURRENT_ENV = ENV_TYPES.PRODUCTION;
```
- **API**: `https://api.jxalk.cn/api`
- **CDN**: `https://cdn.jxalk.cn`
- **Debug**: Disabled
- **Logging**: Disabled
- **Version**: `2.0.0`

## How to Switch Environments

### Before Deployment
Edit `/qianduan/config/env.js` line 16:

**For Development:**
```javascript
const CURRENT_ENV = ENV_TYPES.DEVELOPMENT;
```

**For Staging:**
```javascript
const CURRENT_ENV = ENV_TYPES.STAGING;
```

**For Production:**
```javascript
const CURRENT_ENV = ENV_TYPES.PRODUCTION;
```

### Build Process Recommendation
For automated deployments, consider using build scripts:

1. **Create environment-specific files**:
   - `env.development.js`
   - `env.staging.js`
   - `env.production.js`

2. **Copy appropriate file during build**:
   ```bash
   # Development build
   cp config/env.development.js config/env.js

   # Production build
   cp config/env.production.js config/env.js
   ```

## Testing Verification

### Manual Testing Checklist
- [x] Mini program loads without errors
- [x] No `process is not defined` errors in console
- [ ] API requests use correct base URL
- [ ] Login functionality works
- [ ] Data fetching operations succeed
- [ ] Page navigation works correctly
- [ ] Components render properly

### API Endpoints to Test
1. **Login**: `/api/login`
2. **User Profile**: `/api/user/profile`
3. **Product List**: `/api/products`
4. **Distribution Stats**: `/api/stats/distribution`

### Console Verification
When the mini program loads, you should see:
```
==================================================
环境配置:
当前环境: development
配置信息: { apiBaseUrl: 'https://dev-api.jxalk.cn/api', ... }
==================================================
```

## Best Practices for WeChat Mini Programs

### 1. Avoid Node.js Globals
**Don't use**:
- `process.env.*`
- `__dirname`
- `__filename`
- `global`
- `Buffer`

**Use instead**:
- Plain constants
- WeChat API: `wx.*`
- `getApp()` for app instance

### 2. CommonJS Module System
WeChat mini programs use CommonJS:
```javascript
// Export
module.exports = { ... };

// Import
const module = require('./path/to/module');
```

### 3. Environment-Specific Code
```javascript
// Good
const isDev = CURRENT_ENV === 'development';
if (isDev) {
  console.log('Debug info');
}

// Bad (Node.js specific)
if (process.env.NODE_ENV === 'development') {
  console.log('Debug info');
}
```

### 4. Configuration Management
Keep all configuration in dedicated files:
- `/config/env.js` - Environment settings
- `/config/constants.js` - Application constants
- `/utils/request.js` - Network configuration

## Related Files

### Files Modified
- `/qianduan/config/env.js` - Fixed environment detection

### Files Using Environment Config
- `/qianduan/utils/request.js` - Uses `getApiBaseUrl()`
- `/qianduan/app.js` - May use debug settings
- All API calling code - Inherits base URL from request utility

## Future Improvements

### Option 1: Compile-Time Environment
Use WeChat DevTools custom compilation:
1. Add conditional compilation
2. Set environment in `project.config.json`
3. Build different versions for each environment

### Option 2: Runtime Environment Detection
```javascript
// Detect based on URL patterns or other runtime info
function detectEnvironment() {
  const accountInfo = wx.getAccountInfoSync();
  if (accountInfo.miniProgram.envVersion === 'develop') {
    return ENV_TYPES.DEVELOPMENT;
  } else if (accountInfo.miniProgram.envVersion === 'trial') {
    return ENV_TYPES.STAGING;
  } else {
    return ENV_TYPES.PRODUCTION;
  }
}
```

### Option 3: Remote Configuration
Fetch environment settings from a config API:
```javascript
async function loadRemoteConfig() {
  const config = await wx.request({
    url: 'https://config.example.com/miniapp-config.json'
  });
  return config.data;
}
```

## Error Prevention

### Code Review Checklist
When reviewing WeChat mini program code, check for:
- [ ] No `process.*` references
- [ ] No Node.js-specific APIs
- [ ] CommonJS module syntax (`require`/`module.exports`)
- [ ] WeChat-specific APIs use `wx.*` namespace
- [ ] Environment detection uses WeChat-compatible methods

### ESLint Configuration
Consider adding rules to catch Node.js globals:

```json
{
  "env": {
    "node": false,
    "browser": false,
    "es6": true
  },
  "globals": {
    "wx": "readonly",
    "getApp": "readonly",
    "getCurrentPages": "readonly"
  }
}
```

## Support

### Documentation
- [WeChat Mini Program Developer Guide](https://developers.weixin.qq.com/miniprogram/dev/framework/)
- [WeChat API Reference](https://developers.weixin.qq.com/miniprogram/dev/api/)

### Common Issues
1. **TypeError: Cannot read property 'X' of undefined**
   - Check if WeChat API is supported in current version
   - Verify API permissions in `app.json`

2. **Module not found**
   - Use relative paths: `require('./module')` not `require('module')`
   - Check file extensions (`.js` required in some cases)

3. **Component not registered**
   - Verify `usingComponents` in page JSON
   - Check component paths are correct

---

**Fixed By**: Claude Code
**Date**: 2026-02-10
**Status**: ✅ Resolved
**Severity**: Critical (P0)
**Impact**: All users affected, app couldn't load
