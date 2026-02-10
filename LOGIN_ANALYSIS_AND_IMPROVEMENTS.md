# 登录与分享功能分析及改进建议

## 一、当前登录逻辑分析

### 1.1 登录流程

**是否自动登录？** ✅ **是的，支持自动登录**

登录流程如下：

```
1. 小程序启动 (app.js onLaunch)
   ↓
2. 检查分享绑定 (checkShareBind)
   - 扫码进入: scene=distributor_id
   - 分享链接: share_id=distributor_id
   ↓
3. 自动登录 (autoLogin)
   - 检查本地缓存 (token, openid, userInfo)
   - 如有缓存 → 直接恢复登录状态
   - 无缓存 → 调用 wxLogin() 静默登录
   ↓
4. 微信登录 (wxLogin)
   - wx.login() 获取 code
   - 发送 code 到后端 /api/login
   - 后端返回 token, openid, userInfo
   - 保存到缓存和 globalData
```

### 1.2 能否获取微信头像和昵称？

**当前状态：** ⚠️ **部分支持，但有限制**

#### 现有实现：
- **后端接收参数**：`nickName` 和 `avatarUrl` (authController.js:71)
- **创建新用户时**：
  ```javascript
  nickname: nickName || '微信用户',
  avatar_url: avatarUrl || ''
  ```
- **前端登录**：没有主动获取用户信息

#### 问题：
1. ❌ 前端 `app.js` 的 `wxLogin()` 只发送 `code` 和 `distributor_id`，没有发送 `nickName` 和 `avatarUrl`
2. ❌ 微信小程序新规定：必须通过 `<button open-type="getUserProfile">` 才能获取用户信息
3. ❌ 不能在启动时自动获取，必须用户主动点击授权

#### 解决方案：
需要在用户中心添加"完善资料"按钮，让用户主动授权获取头像和昵称。

---

## 二、改进建议

### 2.1 完善用户信息获取 ⭐⭐⭐⭐⭐

**问题：** 当前登录不获取微信头像和昵称

**改进方案：**

1. **在用户中心添加"完善资料"按钮**
   ```javascript
   // pages/user/user.wxml
   <button open-type="getUserProfile" bindgetuserprofile="onGetUserProfile">
       完善资料（获取头像和昵称）
   </button>

   // pages/user/user.js
   async onGetUserProfile(e) {
       const { userInfo } = e.detail;
       // 更新到服务器
       await updateUserInfo({
           nickname: userInfo.nickName,
           avatar_url: userInfo.avatarUrl
       });
   }
   ```

2. **首次登录时引导用户完善资料**
   - 登录成功后，如果 `avatar_url` 为空，显示引导弹窗
   - 引导用户点击授权

### 2.2 简化分享链接流程 ⭐⭐⭐⭐⭐

**当前问题：**
- ✅ 已有分享功能 `onShareAppMessage`
- ✅ 已有邀请码系统 (6位数字)
- ⚠️ 但用户体验可以更好

**改进方案：**

#### 2.2.1 添加一键分享按钮

在个人中心添加显眼的"邀请好友"卡片：

```javascript
// pages/user/user.wxml
<view class="invite-card" bindtap="onShareTap">
    <view class="invite-title">邀请好友赚佣金</view>
    <view class="invite-code">我的邀请码：{{userInfo.invite_code}}</view>
    <view class="invite-btn">
        <button open-type="share">立即分享</button>
    </view>
</view>
```

#### 2.2.2 复制链接功能

```javascript
onCopyShareLink() {
    const userInfo = this.data.userInfo;
    const inviteCode = userInfo.invite_code;
    const link = `小程序链接?share_id=${inviteCode}`;
    wx.setClipboardData({
        data: link,
        success: () => {
            wx.showToast({ title: '链接已复制，去分享吧', icon: 'success' });
        }
    });
}
```

### 2.3 生成专属二维码 ⭐⭐⭐⭐⭐

**新功能：** 为每个用户生成专属邀请二维码

**实现方案：**

#### 后端实现：

```javascript
// backend/routes/distribution.js
router.get('/qrcode', authenticateUser, async (req, res) => {
    const user = req.user;
    const inviteCode = user.invite_code;

    // 调用微信 API 生成小程序码
    // https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/qr-code/wxacode.getUnlimited.html

    const result = await generateMiniQRCode({
        scene: inviteCode,
        page: 'pages/index/index'
    });

    res.json({
        success: true,
        data: {
            qrcode_url: result.url  // 返回二维码图片URL
        }
    });
});
```

#### 前端实现：

```javascript
// pages/distribution/center.js
async loadQRCode() {
    const res = await get('/distribution/qrcode');
    if (res.code === 0) {
        this.setData({ qrcodeUrl: res.data.qrcode_url });
    }
}

// pages/distribution/center.wxml
<view class="qrcode-section">
    <image src="{{qrcodeUrl}}" mode="aspectFit" />
    <text>扫码加入我的团队</text>
    <button bindtap="onSaveQRCode">保存二维码</button>
</view>
```

### 2.4 简化邀请码输入 ⭐⭐⭐⭐

**当前问题：**
- ✅ 已有绑定邀请码功能 (distribution/center.js:88-100)
- ⚠️ 用户体验可以更好

**改进方案：**

#### 2.4.1 自动填充邀请码

```javascript
// app.js - 改进 checkShareBind
checkShareBind(options) {
    let distributorId = null;

    if (options && options.query && options.query.scene) {
        distributorId = decodeURIComponent(options.query.scene);
    } else if (options && options.query && options.query.share_id) {
        distributorId = options.query.share_id;
    }

    if (distributorId) {
        wx.setStorageSync('distributor_id', distributorId);
        // 新增：设置标记，首次登录后自动弹出绑定确认
        wx.setStorageSync('pending_bind', true);
    }
}
```

#### 2.4.2 首次登录后自动弹窗确认绑定

```javascript
// pages/index/index.js 或 pages/user/user.js
onShow() {
    const pendingBind = wx.getStorageSync('pending_bind');
    const distributorId = wx.getStorageSync('distributor_id');

    if (pendingBind && distributorId && app.globalData.isLoggedIn) {
        // 显示确认绑定弹窗
        wx.showModal({
            title: '绑定邀请人',
            content: `确认绑定邀请码：${distributorId}？`,
            success: async (res) => {
                if (res.confirm) {
                    await this.bindParent(distributorId);
                }
                wx.removeStorageSync('pending_bind');
            }
        });
    }
}
```

### 2.5 分享海报生成 ⭐⭐⭐⭐

**新功能：** 生成精美的分享海报

**实现方案：**

```javascript
// utils/poster.js - 海报生成工具
function generatePoster(userInfo, qrcodeUrl) {
    return new Promise((resolve) => {
        const ctx = wx.createCanvasContext('posterCanvas');

        // 1. 绘制背景
        ctx.drawImage('/assets/images/poster-bg.jpg', 0, 0, 750, 1334);

        // 2. 绘制用户头像
        ctx.save();
        ctx.beginPath();
        ctx.arc(375, 200, 80, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(userInfo.avatar_url, 295, 120, 160, 160);
        ctx.restore();

        // 3. 绘制昵称
        ctx.setFillStyle('#333');
        ctx.setFontSize(32);
        ctx.fillText(userInfo.nickname, 375, 320);

        // 4. 绘制邀请码
        ctx.setFillStyle('#ff6b6b');
        ctx.setFontSize(48);
        ctx.fillText(`邀请码：${userInfo.invite_code}`, 375, 400);

        // 5. 绘制二维码
        ctx.drawImage(qrcodeUrl, 275, 500, 200, 200);

        // 6. 绘制文案
        ctx.setFillStyle('#666');
        ctx.setFontSize(28);
        ctx.fillText('扫码加入我的团队，一起赚钱', 375, 750);

        ctx.draw(false, () => {
            // 导出为图片
            wx.canvasToTempFilePath({
                canvasId: 'posterCanvas',
                success: (res) => resolve(res.tempFilePath)
            });
        });
    });
}
```

### 2.6 分享成功反馈 ⭐⭐⭐

**改进：** 分享后显示成功提示

```javascript
// 在所有页面的 onShareAppMessage 后添加
onShareAppMessage() {
    const userInfo = this.data.userInfo;
    const inviteCode = userInfo ? (userInfo.invite_code || userInfo.id) : '';

    // 分享成功后的回调
    wx.showToast({
        title: '分享成功，等待好友加入',
        icon: 'success'
    });

    return {
        title: '臻选 · 精选全球好物，邀你一起赚',
        path: `/pages/index/index?share_id=${inviteCode}`,
        imageUrl: ''
    };
}
```

### 2.7 邀请记录展示 ⭐⭐⭐

**新功能：** 显示通过我的邀请加入的用户

**实现方案：**

```javascript
// pages/distribution/team.js - 已有团队页面，可以增强
async loadInviteRecords() {
    const res = await get('/distribution/invite-records');
    if (res.code === 0) {
        this.setData({
            inviteRecords: res.data.map(record => ({
                nickname: record.nickname,
                avatar_url: record.avatar_url,
                join_date: record.created_at,
                total_orders: record.order_count,
                total_commission: record.commission_amount
            }))
        });
    }
}
```

---

## 三、优先级排序

### P0 - 必须实现（最简单最有效）

1. ✅ **完善用户信息获取** - 添加 getUserProfile 授权按钮
2. ✅ **简化分享流程** - 优化分享按钮和文案
3. ✅ **邀请码复制优化** - 一键复制链接

### P1 - 建议实现（提升体验）

4. ✅ **生成专属二维码** - 用户可以保存分享
5. ✅ **首次登录绑定优化** - 自动弹窗确认绑定
6. ✅ **分享成功反馈** - 增加用户信心

### P2 - 可选实现（锦上添花）

7. ⭐ **分享海报生成** - 精美海报更易传播
8. ⭐ **邀请记录展示** - 让用户看到成果

---

## 四、技术实现要点

### 4.1 微信小程序用户信息获取新规

从 2021年4月13日 开始，微信小程序调整了用户信息接口：

- ❌ 不能使用 `wx.getUserInfo` 直接获取
- ✅ 必须使用 `<button open-type="getUserProfile">` 让用户主动授权
- ✅ 每次都需要用户点击授权，不能静默获取

### 4.2 微信小程序码生成

需要后端调用微信 API：

```javascript
// 无限量小程序码
POST https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=ACCESS_TOKEN

{
    "scene": "invite_code_123456",  // 最多32个字符
    "page": "pages/index/index",    // 落地页
    "width": 430                     // 二维码宽度
}
```

### 4.3 分享参数传递

微信小程序支持两种分享入口：

1. **链接分享**：`?share_id=123456`
2. **扫码分享**：`?scene=123456`

都已经在 `app.js` 的 `checkShareBind()` 中处理。

---

## 五、代码改进示例

### 5.1 app.js 改进（获取用户信息）

```javascript
// 当前：只发送 code
const result = await login({ code, distributor_id });

// 改进：支持传入用户信息（由用户页面调用）
async wxLogin(distributorId = null, userProfile = null) {
    const { code } = await this.promisify(wx.login)();

    const params = {
        code,
        distributor_id: distributorId
    };

    // 如果有用户资料，一起发送
    if (userProfile) {
        params.nickName = userProfile.nickName;
        params.avatarUrl = userProfile.avatarUrl;
    }

    const { login } = require('./utils/auth');
    const result = await login(params);
    // ...
}
```

### 5.2 user.js 添加用户资料授权

```javascript
// 获取用户资料
async onGetUserProfile() {
    try {
        const { userInfo } = await wx.getUserProfile({
            desc: '用于完善会员资料'
        });

        // 更新到服务器
        const { put } = require('../../utils/request');
        const res = await put('/user/profile', {
            nickname: userInfo.nickName,
            avatar_url: userInfo.avatarUrl
        });

        if (res.code === 0) {
            wx.showToast({ title: '资料已更新', icon: 'success' });
            this.loadUserInfo();
        }
    } catch (err) {
        console.error('获取用户信息失败:', err);
    }
}
```

### 5.3 distribution/center.js 添加二维码和海报

```javascript
data: {
    // ...现有数据
    qrcodeUrl: '',      // 二维码图片
    posterUrl: '',       // 海报图片
    showPoster: false    // 显示海报弹窗
},

// 加载二维码
async loadQRCode() {
    const res = await get('/distribution/qrcode');
    if (res.code === 0 && res.data) {
        this.setData({ qrcodeUrl: res.data.qrcode_url });
    }
},

// 生成海报
async onGeneratePoster() {
    wx.showLoading({ title: '生成中...' });

    const { generatePoster } = require('../../utils/poster');
    const posterUrl = await generatePoster(
        this.data.userInfo,
        this.data.qrcodeUrl
    );

    wx.hideLoading();
    this.setData({
        posterUrl,
        showPoster: true
    });
},

// 保存海报
async onSavePoster() {
    const { posterUrl } = this.data;

    wx.saveImageToPhotosAlbum({
        filePath: posterUrl,
        success: () => {
            wx.showToast({ title: '已保存到相册', icon: 'success' });
        },
        fail: () => {
            wx.showToast({ title: '保存失败', icon: 'none' });
        }
    });
}
```

---

## 六、总结

### 当前登录逻辑总结：

✅ **优点：**
1. 支持自动登录，用户体验好
2. 完整的分享绑定逻辑（链接和二维码）
3. 邀请码系统完善

⚠️ **不足：**
1. 没有获取微信头像和昵称（需要用户主动授权）
2. 分享功能可以更直观
3. 缺少二维码生成和海报功能

### 改进后的效果：

✅ **完善的用户体验：**
- 用户可以主动授权获取头像和昵称
- 一键复制分享链接
- 专属二维码可保存分享
- 精美海报提升转化率
- 首次进入自动提示绑定

✅ **简化的分享流程：**
- 个人中心显眼的"邀请好友"卡片
- 一键分享按钮
- 复制链接快捷功能
- 二维码随时可下载

✅ **更好的数据追踪：**
- 邀请记录清晰展示
- 分享成功即时反馈
- 团队数据实时更新

---

## 七、实施建议

**第一阶段（最简单，立即可做）：**
1. 添加 getUserProfile 授权按钮
2. 优化分享按钮和文案
3. 添加一键复制链接功能

**第二阶段（提升体验）：**
4. 后端开发二维码生成接口
5. 前端展示二维码
6. 首次登录绑定优化

**第三阶段（锦上添花）：**
7. 开发海报生成功能
8. 增强邀请记录展示
9. 添加分享数据统计

这样循序渐进，既能快速看到效果，又不会一次改动太多代码。
