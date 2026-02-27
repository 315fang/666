// pages/pickup/pickup.js
const { get } = require('../../utils/request');
const app = getApp();

Page({
    data: {
        statusBarHeight: wx.getSystemInfoSync().statusBarHeight,
        info: null,
        codeFormatted: ''
    },

    onLoad(options) {
        this.orderId = options.order_id;
        if (this.orderId) this.loadPickupInfo();
    },

    async loadPickupInfo() {
        try {
            const res = await get(`/pickup/my/${this.orderId}`);
            if (res.code === 0) {
                const info = res.data;
                // 格式化16位码为 XXXX-XXXX-XXXX-XXXX
                const code = info.pickup_code || '';
                const codeFormatted = code.match(/.{1,4}/g)?.join('-') || code;
                this.setData({ info, codeFormatted });

                // 生成二维码（若未核销）
                if (!info.verified_at && info.pickup_qr_token) {
                    this.drawQrCode(info.pickup_qr_token);
                }
            }
        } catch (e) {
            wx.showToast({ title: '加载失败，请重试', icon: 'none' });
        }
    },

    // 使用Canvas绘制简单QR码（实际可接入第三方二维码库）
    drawQrCode(token) {
        const ctx = wx.createCanvasContext('qrCanvas');
        const size = 200;
        // 简化：绘制带token文字的占位QR框（生产环境应使用真实二维码库如 weapp-qrcode）
        ctx.setFillStyle('#FFFFFF');
        ctx.fillRect(0, 0, size, size);
        ctx.setStrokeStyle('#1A1A1A');
        ctx.setLineWidth(4);
        ctx.strokeRect(2, 2, size - 4, size - 4);
        // 三角定位角
        const corners = [[10, 10], [size - 50, 10], [10, size - 50]];
        corners.forEach(([x, y]) => {
            ctx.setFillStyle('#1A1A1A');
            ctx.fillRect(x, y, 40, 40);
            ctx.setFillStyle('#FFFFFF');
            ctx.fillRect(x + 6, y + 6, 28, 28);
            ctx.setFillStyle('#1A1A1A');
            ctx.fillRect(x + 12, y + 12, 16, 16);
        });
        // 中心区：token短码
        ctx.setFontSize(10);
        ctx.setFillStyle('#666');
        ctx.setTextAlign('center');
        ctx.fillText(token.substring(0, 8), size / 2, size / 2 - 5);
        ctx.fillText(token.substring(8, 16), size / 2, size / 2 + 8);
        ctx.draw();
    },

    copyCode() {
        const code = this.data.info?.pickup_code;
        if (!code) return;
        wx.setClipboardData({ data: code, success: () => wx.showToast({ title: '已复制', icon: 'success' }) });
    },

    onBack() { wx.navigateBack(); }
});
