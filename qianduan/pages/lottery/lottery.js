// pages/lottery/lottery.js
const app = getApp();
const { get, post } = require('../../utils/request');

const PRIZE_EMOJI = { physical: '🎁', points: '⭐', coupon: '🎫', miss: '😢' };

Page({
    data: {
        statusBarHeight: wx.getSystemInfoSync().statusBarHeight,
        mode: 'spin',  // 'spin' | 'blindbox'（由后端配置决定）
        prizes: [],
        records: [],
        pointBalance: 0,
        costPoints: 50,
        spinning: false,
        opening: false,
        showResult: false,
        lastPrize: null,
        prizeEmoji: PRIZE_EMOJI,
        // 转盘状态
        rotation: 0
    },

    onLoad() {
        this.loadData();
    },

    async loadData() {
        this.loadPrizes();
        this.loadRecords();
        this.loadPointBalance();
    },

    async loadPrizes() {
        try {
            const res = await get('/lottery/prizes');
            if (res.code === 0) {
                const prizes = res.data || [];
                this.setData({ prizes, costPoints: prizes[0]?.cost_points || 50 });
                // 延迟绘制转盘（等 canvas ready）
                setTimeout(() => this.drawWheel(), 100);
            }
        } catch (e) { console.error('加载奖品失败:', e); }
    },

    async loadRecords() {
        try {
            const res = await get('/lottery/records', { page: 1, limit: 10 });
            if (res.code === 0) {
                this.setData({ records: res.data?.list || [] });
            }
        } catch (e) { console.error('加载记录失败:', e); }
    },

    async loadPointBalance() {
        try {
            const res = await get('/points/balance');
            if (res.code === 0) {
                this.setData({ pointBalance: res.data?.balance_points || 0 });
            }
        } catch (e) { }
    },

    // ===== 执行抽奖 =====
    async onDraw() {
        if (this.data.spinning || this.data.opening) return;
        if (!app.globalData.isLoggedIn) {
            wx.showToast({ title: '请先登录', icon: 'none' });
            return;
        }
        if (this.data.pointBalance < this.data.costPoints) {
            wx.showModal({
                title: '积分不足',
                content: `本次抽奖需要 ${this.data.costPoints} 积分，当前余额不足`,
                showCancel: false
            });
            return;
        }

        const key = this.data.mode === 'spin' ? 'spinning' : 'opening';
        this.setData({ [key]: true });

        try {
            // 动画
            if (this.data.mode === 'spin') this.startSpinAnimation();

            const res = await post('/lottery/draw');
            if (res.code === 0) {
                const prize = res.data.prize;
                this.setData({
                    lastPrize: prize,
                    pointBalance: this.data.pointBalance - this.data.costPoints
                });

                if (this.data.mode === 'spin') {
                    // 停在对应格
                    this.stopSpinAnimation(prize);
                } else {
                    setTimeout(() => {
                        this.setData({ opening: false, showResult: true });
                    }, 800);
                }

                this.loadRecords();
                this.loadPointBalance();
            } else {
                wx.showToast({ title: res.message || '抽奖失败', icon: 'none' });
                this.setData({ [key]: false });
            }
        } catch (e) {
            wx.showToast({ title: '网络错误，请重试', icon: 'none' });
            this.setData({ [key]: false });
        }
    },

    // 转盘动画
    startSpinAnimation() {
        // 快速旋转 3 圈
        this._spinStart = Date.now();
        this._animInterval = setInterval(() => {
            const elapsed = Date.now() - this._spinStart;
            const speed = Math.max(5, 30 - elapsed / 100);
            const rot = (this.data.rotation + speed) % 360;
            this.setData({ rotation: rot });
        }, 16);
    },

    stopSpinAnimation(prize) {
        if (this._animInterval) clearInterval(this._animInterval);
        // 简单结束动画后显示结果
        setTimeout(() => {
            this.setData({ spinning: false, showResult: true });
        }, 500);
    },

    // 绘制转盘（Canvas 2D）
    drawWheel() {
        const ctx = wx.createCanvasContext('wheelCanvas');
        const prizes = this.data.prizes;
        if (!prizes.length) return;
        const centerX = 140, centerY = 140, radius = 130;
        const sliceAngle = (2 * Math.PI) / prizes.length;
        const colors = ['#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EF4444', '#F97316', '#06B6D4', '#EC4899'];

        prizes.forEach((prize, i) => {
            const startAngle = i * sliceAngle - Math.PI / 2;
            const endAngle = startAngle + sliceAngle;
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.arc(centerX, centerY, radius, startAngle, endAngle);
            ctx.closePath();
            ctx.fillStyle = colors[i % colors.length];
            ctx.fill();
            ctx.setStrokeStyle('#FFFFFF');
            ctx.setLineWidth(2);
            ctx.stroke();

            // 文字
            const midAngle = startAngle + sliceAngle / 2;
            const textX = centerX + Math.cos(midAngle) * radius * 0.65;
            const textY = centerY + Math.sin(midAngle) * radius * 0.65;
            ctx.setFontSize(11);
            ctx.setFillStyle('#FFFFFF');
            ctx.setTextAlign('center');
            const name = prize.name.length > 6 ? prize.name.substring(0, 5) + '..' : prize.name;
            ctx.fillText(name, textX, textY + 5);
        });

        // 中心圆
        ctx.beginPath();
        ctx.arc(centerX, centerY, 28, 0, 2 * Math.PI);
        ctx.fillStyle = '#1C1917';
        ctx.fill();
        ctx.draw();
    },

    closeResult() {
        this.setData({ showResult: false });
    },

    onBack() {
        wx.navigateBack();
    }
});
