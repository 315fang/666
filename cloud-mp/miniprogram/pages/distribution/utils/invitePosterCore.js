/**
 * 邀请海报 Canvas 绘制 — 高端简约版
 */
const { callFn } = require('../../../utils/cloud');

const POSTER_W = 600;
const POSTER_H = 960;

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

class InvitePosterCore {
    constructor(wxPage) {
        this.page = wxPage;
    }

    async getPosterCanvas2d() {
        await sleep(48);
        const query = wx.createSelectorQuery().in(this.page);
        const canvasNode = await new Promise((resolve, reject) => {
            query.select('#posterCanvas').fields({ node: true, size: true }, (res) => {
                if (res && res.node) resolve(res);
                else reject(new Error('canvas 节点获取失败，请重试'));
            }).exec();
        });
        const canvas = canvasNode.node;
        const dpr = (typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2;
        canvas.width = POSTER_W * dpr;
        canvas.height = POSTER_H * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        return { canvas, ctx, W: POSTER_W, H: POSTER_H };
    }

    exportPoster(canvas) {
        return new Promise((resolve, reject) => {
            wx.canvasToTempFilePath({
                canvas,
                fileType: 'jpg',
                quality: 0.92,
                success: (r) => resolve(r.tempFilePath),
                fail: reject
            });
        });
    }

    loadCanvasImage(canvas, src) {
        return new Promise((resolve, reject) => {
            const img = canvas.createImage();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = src;
        });
    }

    async fetchInviteWxaCodeToTempPath() {
        let res;
        try {
            res = await callFn('distribution', { action: 'wxacodeInvite' }, { showError: false });
        } catch (err) {
            const message = String(err?.message || err?.errMsg || '');
            if (message.includes('未知 action: wxacodeInvite')) {
                throw new Error('邀请海报云函数未更新，请在微信开发者工具上传并部署 distribution 云函数');
            }
            throw err;
        }
        if (!res || !res.buffer) {
            throw new Error(res?.message || '小程序码生成失败');
        }
        const fs = wx.getFileSystemManager();
        const root = wx.env && wx.env.USER_DATA_PATH;
        if (!root) {
            throw new Error('请升级微信版本后重试');
        }
        const filePath = `${root}/invite_wxacode_tmp.png`;
        await new Promise((resolve, reject) => {
            fs.writeFile({
                filePath,
                data: res.buffer,
                success: resolve,
                fail: reject
            });
        });
        return filePath;
    }

    fillRoundRect(ctx, x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    /**
     * 绘制主海报 — 优雅深色风格
     */
    async drawPoster(ctx, canvas, W, H, userInfo, memberCode, brandName) {
        // ── 背景渐变 ──
        const bg = ctx.createLinearGradient(0, 0, W * 0.3, H);
        bg.addColorStop(0, '#1C1614');
        bg.addColorStop(0.4, '#2A201A');
        bg.addColorStop(0.7, '#342820');
        bg.addColorStop(1, '#2A1F18');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // ── 顶部装饰光晕 ──
        const glow = ctx.createRadialGradient(W * 0.7, 0, 0, W * 0.7, 0, 320);
        glow.addColorStop(0, 'rgba(200, 162, 88, 0.08)');
        glow.addColorStop(1, 'rgba(200, 162, 88, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, 320);

        // ── 底部装饰光晕 ──
        const glow2 = ctx.createRadialGradient(W * 0.2, H, 0, W * 0.2, H, 280);
        glow2.addColorStop(0, 'rgba(200, 162, 88, 0.06)');
        glow2.addColorStop(1, 'rgba(200, 162, 88, 0)');
        ctx.fillStyle = glow2;
        ctx.fillRect(0, H - 280, W, 280);

        // ── 细线装饰框 ──
        ctx.strokeStyle = 'rgba(200, 162, 88, 0.15)';
        ctx.lineWidth = 1;
        this.fillRoundRect(ctx, 28, 28, W - 56, H - 56, 24);
        ctx.stroke();

        // ── 头像 ──
        const AVATAR_R = 56;
        const AVATAR_X = W / 2;
        const AVATAR_Y = 110;
        if (userInfo.avatar || userInfo.avatar_url) {
            try {
                const imgObj = await this.loadCanvasImage(canvas, userInfo.avatar || userInfo.avatar_url);
                ctx.save();
                ctx.beginPath();
                ctx.arc(AVATAR_X, AVATAR_Y, AVATAR_R, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(imgObj, AVATAR_X - AVATAR_R, AVATAR_Y - AVATAR_R, AVATAR_R * 2, AVATAR_R * 2);
                ctx.restore();
            } catch (_) {
                ctx.beginPath();
                ctx.arc(AVATAR_X, AVATAR_Y, AVATAR_R, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(200, 162, 88, 0.12)';
                ctx.fill();
            }
        } else {
            ctx.beginPath();
            ctx.arc(AVATAR_X, AVATAR_Y, AVATAR_R, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(200, 162, 88, 0.12)';
            ctx.fill();
        }
        // 头像金圈
        ctx.beginPath();
        ctx.arc(AVATAR_X, AVATAR_Y, AVATAR_R + 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(200, 162, 88, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // ── 昵称 ──
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFF8F0';
        ctx.font = 'bold 30px sans-serif';
        const nick = (userInfo.nick_name || userInfo.nickname || '好友').length > 12
            ? `${(userInfo.nick_name || userInfo.nickname || '好友').slice(0, 12)}…`
            : (userInfo.nick_name || userInfo.nickname || '好友');
        ctx.fillText(nick, W / 2, AVATAR_Y + AVATAR_R + 48);

        // ── 邀请文案 ──
        ctx.fillStyle = 'rgba(255, 248, 240, 0.55)';
        ctx.font = '24px sans-serif';
        ctx.fillText('邀请你来访', W / 2, AVATAR_Y + AVATAR_R + 86);

        // ── 品牌名 ──
        ctx.fillStyle = '#D4A55A';
        ctx.font = 'bold 44px sans-serif';
        ctx.fillText(brandName, W / 2, AVATAR_Y + AVATAR_R + 144);

        // ── 分隔线 ──
        const LINE_Y = AVATAR_Y + AVATAR_R + 178;
        const lineGrad = ctx.createLinearGradient(80, LINE_Y, W - 80, LINE_Y);
        lineGrad.addColorStop(0, 'rgba(200, 162, 88, 0)');
        lineGrad.addColorStop(0.5, 'rgba(200, 162, 88, 0.35)');
        lineGrad.addColorStop(1, 'rgba(200, 162, 88, 0)');
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(80, LINE_Y);
        ctx.lineTo(W - 80, LINE_Y);
        ctx.stroke();

        // ── 小程序码 ──
        const QR = 180;
        const QR_Y = LINE_Y + 36;
        const QR_X = (W - QR) / 2;

        // 小程序码白底卡片
        ctx.fillStyle = '#FFFFFF';
        this.fillRoundRect(ctx, QR_X - 16, QR_Y - 16, QR + 32, QR + 32, 20);
        ctx.fill();
        // 卡片阴影边
        ctx.strokeStyle = 'rgba(200, 162, 88, 0.2)';
        ctx.lineWidth = 1;
        this.fillRoundRect(ctx, QR_X - 16, QR_Y - 16, QR + 32, QR + 32, 20);
        ctx.stroke();

        let qrDrawSuccess = false;
        try {
            const tmpPath = await this.fetchInviteWxaCodeToTempPath();
            const qrImg = await this.loadCanvasImage(canvas, tmpPath);
            ctx.drawImage(qrImg, QR_X, QR_Y, QR, QR);
            qrDrawSuccess = true;
        } catch (err) {
            console.warn('小程序码绘制失败:', err);
            this.qrDrawError = err;
        }

        if (!qrDrawSuccess) {
            ctx.fillStyle = '#F5F0EB';
            ctx.fillRect(QR_X, QR_Y, QR, QR);
            ctx.fillStyle = '#B0A090';
            ctx.font = '22px sans-serif';
            ctx.fillText('扫码访问', W / 2, QR_Y + QR / 2 + 8);
        }

        // ── 提示文案 ──
        const TIP_Y = QR_Y + QR + 40;
        ctx.fillStyle = 'rgba(255, 248, 240, 0.45)';
        ctx.font = '20px sans-serif';
        ctx.fillText('长按识别小程序码', W / 2, TIP_Y);

        // ── 会员码区域 ──
        if (memberCode) {
            const CODE_Y = TIP_Y + 28;
            const CODE_W = 360;
            const CODE_H = 72;
            const CODE_X = (W - CODE_W) / 2;
            ctx.fillStyle = 'rgba(200, 162, 88, 0.08)';
            this.fillRoundRect(ctx, CODE_X, CODE_Y, CODE_W, CODE_H, 16);
            ctx.fill();
            ctx.strokeStyle = 'rgba(200, 162, 88, 0.25)';
            ctx.lineWidth = 1;
            this.fillRoundRect(ctx, CODE_X, CODE_Y, CODE_W, CODE_H, 16);
            ctx.stroke();

            ctx.fillStyle = 'rgba(255, 248, 240, 0.4)';
            ctx.font = '18px sans-serif';
            ctx.fillText('专属会员码', W / 2, CODE_Y + 26);
            ctx.fillStyle = '#FFF8F0';
            ctx.font = 'bold 32px sans-serif';
            ctx.fillText(memberCode, W / 2, CODE_Y + 58);
        }

        // ── 底部品牌 ──
        ctx.fillStyle = 'rgba(200, 162, 88, 0.3)';
        ctx.font = '18px sans-serif';
        ctx.fillText(`${brandName} · 品质甄选`, W / 2, H - 52);
    }

    async generateToTempPath({ memberCode, userInfo, brandName }) {
        this.qrDrawError = null;
        await new Promise((resolve) => {
            if (typeof wx.nextTick === 'function') wx.nextTick(resolve);
            else resolve();
        });
        await sleep(32);
        const { canvas, ctx, W, H } = await this.getPosterCanvas2d();
        await this.drawPoster(ctx, canvas, W, H, userInfo, memberCode, brandName);
        if (this.qrDrawError) {
            throw this.qrDrawError;
        }
        return this.exportPoster(canvas);
    }
}

module.exports = { InvitePosterCore, POSTER_W, POSTER_H };
