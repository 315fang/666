// pages/feed/index.js
const { get, post } = require('../../utils/request');
const app = getApp();

Page({
    data: {
        userName: '生活家',
        boxCount: 0,

        // 渲染用的卡片列表
        cards: [],

        // 当前显示的顶部卡片索引
        currentIndex: 0,

        // 滑动动画数据
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        cardTransform: '',
        cardRotate: '',
        nopeOpacity: 0,
        likeOpacity: 0,

        isDragging: false,
        loading: false
    },

    onLoad() {
        this.refreshFeed();
        // 模拟获取用户信息
        const userInfo = wx.getStorageSync('userInfo');
        if (userInfo && userInfo.nickname) {
            this.setData({ userName: userInfo.nickname });
        }
    },

    onShow() {
        // 每次显示页面更新右上的“定见箱”数量 (演示用)
        this.setData({ boxCount: wx.getStorageSync('boxList')?.length || 0 });
    },

    // ========= 1. 数据加载 =========
    async refreshFeed() {
        this.setData({ loading: true, currentIndex: 0 });
        wx.showLoading({ title: 'AI 极速测算中' });

        try {
            const res = await get('/v2/ai/feed/products');
            if (res.code === 0 && res.data) {
                this.setData({
                    cards: res.data,
                    loading: false
                });
            } else {
                wx.showToast({ title: '没有更多商品了', icon: 'none' });
                this.setData({ loading: false });
            }
        } catch (e) {
            console.error(e);
            wx.showToast({ title: '引擎加载失败', icon: 'none' });
            this.setData({ loading: false });
        } finally {
            wx.hideLoading();
        }
    },

    // ========= 2. Tinder 级丝滑滑动引擎 =========
    touchStart(e) {
        if (this.data.currentIndex >= this.data.cards.length) return;
        this.setData({
            isDragging: true,
            startX: e.touches[0].clientX,
            startY: e.touches[0].clientY
        });
    },

    touchMove(e) {
        if (!this.data.isDragging) return;
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const deltaX = currentX - this.data.startX;
        const deltaY = currentY - this.data.startY;

        // 计算旋转和透明度
        const rotate = deltaX * 0.05; // 滑动越多转得越多
        const opacityDrop = Math.abs(deltaX) / 150 > 1 ? 1 : Math.abs(deltaX) / 150;

        this.setData({
            currentX: deltaX,
            cardTransform: `transform: translateX(${deltaX}px) translateY(${deltaY}px) rotate(${rotate}deg);`,
            nopeOpacity: deltaX < 0 ? opacityDrop : 0,
            likeOpacity: deltaX > 0 ? opacityDrop : 0
        });
    },

    touchEnd(e) {
        if (!this.data.isDragging) return;
        this.setData({ isDragging: false });
        const deltaX = this.data.currentX;

        // 滑动距离超过阈值（如90px），则判定为滑出
        if (deltaX > 90) {
            this.handleSwipeAction('right'); // 喜欢
        } else if (deltaX < -90) {
            this.handleSwipeAction('left');  // 不喜欢
        } else {
            // 未达阈值，回弹居中
            this.resetCardPosition();
        }
    },

    // 按钮触发的强制滑动
    forceSwipeLeft() { this.handleSwipeAction('left', true); },
    forceSwipeRight() { this.handleSwipeAction('right', true); },

    // ========= 3. 核心：隐式数据上传与切卡 =========
    handleSwipeAction(direction, isButtonClick = false) {
        if (this.data.currentIndex >= this.data.cards.length) return;

        const card = this.data.cards[this.data.currentIndex];

        // 如果是通过按钮点击，制造一个强外力动画
        if (isButtonClick) {
            const flyX = direction === 'right' ? 500 : -500;
            this.setData({
                cardTransform: `transform: translateX(${flyX}px) translateY(50px) rotate(${direction === 'right' ? 20 : -20}deg); transition: transform 0.4s ease-out;`,
                nopeOpacity: direction === 'left' ? 1 : 0,
                likeOpacity: direction === 'right' ? 1 : 0
            });
        }

        // 震动反馈 (微信支持极弱震动)
        wx.vibrateShort({ type: 'medium' });

        // 记录隐性行为数据
        this.logBehavior(card, direction === 'right' ? 'LIKE' : 'DISLIKE');

        // 延迟 300ms 移除卡片（让动画飞走）
        setTimeout(() => {
            // 若右滑，加入“定见箱”
            if (direction === 'right') {
                this.addToBox(card);
            }

            // 切卡并清空动画变量
            this.setData({
                currentIndex: this.data.currentIndex + 1,
                cardTransform: '',
                nopeOpacity: 0,
                likeOpacity: 0,
                currentX: 0
            });
        }, 300);
    },

    resetCardPosition() {
        this.setData({
            cardTransform: 'transform: translateX(0) translateY(0) rotate(0); transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);',
            nopeOpacity: 0,
            likeOpacity: 0,
            currentX: 0
        });
        // 清除 transition 方便下次拖拽
        setTimeout(() => {
            this.setData({ cardTransform: '' });
        }, 300);
    },

    // ======== 4. 业务逻辑接口 ========
    logBehavior(product, action) {
        // TODO: 调用后端打探针 API
        // action: LIKE (右滑) / DISLIKE (左滑) / STAY (停留过久)
        console.log(`[AI 探针] 商品ID: ${product.id}, 用户行为: ${action}, 标签权重调整: ${product.tags.join(',')}`);
        // wx.request(...)
    },

    addToBox(product) {
        // 本地暂存（模拟）
        let list = wx.getStorageSync('boxList') || [];
        // 防重
        if (!list.find(item => item.id === product.id)) {
            list.push(product);
            wx.setStorageSync('boxList', list);
            wx.showToast({ title: '已入定见箱', icon: 'none' });
            this.setData({ boxCount: list.length });
        }
    },

    goToBox() {
        wx.switchTab({ url: '/pages/cart/cart' });
    }
});
