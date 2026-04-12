/**
 * 邀请海报 Canvas 绘制
 * - 支持三种变体：invite（邀请语+码）、wxacode（纯扫码）、creative（票根风）
 * - wxacode 失败时自动降级为邀请码显示，不影响整张海报生成
 * - 同一页面会话内缓存小程序码路径，避免重复请求
 */
const { callFn } = require('../../../utils/cloud');
const { getUserAvatar, getUserNickname, normalizeUserProfile } = require('../../../utils/userProfile');

const POSTER_W = 600;
const POSTER_H = 960;

// 同一页面会话内的小程序码缓存（内存级，页面关闭即清除）
let _wxacodeTempPathCache = null;

function fillRoundRect(ctx, x, y, w, h, r) {
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
    ctx.fill();
}

function strokeRoundRect(ctx, x, y, w, h, r) {
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
    ctx.stroke();
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/** 清除小程序码内存缓存（页面重新初始化时调用） */
function clearWxacodeCache() {
    _wxacodeTempPathCache = null;
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
            img.onerror = (e) => reject(new Error(`图片加载失败: ${src}`));
            img.src = src;
        });
    }

    /**
     * 获取小程序邀请码图（带内存缓存，同一会话不重复请求）
     * 失败时返回 null，调用方负责降级处理
     */
    async fetchInviteWxaCodeToTempPath() {
        if (_wxacodeTempPathCache) return _wxacodeTempPathCache;

        const res = await callFn('distribution', { action: 'wxacodeInvite' }, { showError: false });
        const base64 = res && res.data && res.data.wxacode_base64;
        if (!base64) {
            const errMsg = (res && res.data && res.data.error) || '未返回小程序码数据';
            console.warn('[InvitePosterCore] 小程序码未返回:', errMsg);
            return null;
        }

        const fs = wx.getFileSystemManager();
        const root = wx.env && wx.env.USER_DATA_PATH;
        if (!root) return null;

        const filePath = `${root}/invite_wxacode_tmp.png`;
        const buf = wx.base64ToArrayBuffer(base64);
        await new Promise((resolve, reject) => {
            fs.writeFile({ filePath, data: buf, success: resolve, fail: reject });
        });
        _wxacodeTempPathCache = filePath;
        return filePath;
    }

    // ─── 背景卡片 ───────────────────────────────────────

    async drawBaseCard(ctx, W, H, brandName) {
        // 渐变深棕背景
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#2A1E14');
        bg.addColorStop(0.5, '#3F2C1E');
        bg.addColorStop(1, '#2E2218');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // 装饰光晕
        ctx.globalAlpha = 0.05;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(W - 40, 100, 240, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(40, H - 100, 180, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // 顶部品牌名
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(200,162,88,0.8)';
        ctx.font = '24px sans-serif';
        ctx.fillText(brandName, W / 2, 48);

        // 顶部分隔线
        ctx.strokeStyle = 'rgba(200,162,88,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W / 2 - 80, 62);
        ctx.lineTo(W / 2 + 80, 62);
        ctx.stroke();
    }

    // ─── 头像 + 昵称 ────────────────────────────────────

    async drawAvatarNick(ctx, canvas, W, avatarUrl, nickname, y0, opts = {}) {
        const showNickname = opts.showNickname !== false;
        const AVATAR_R = 60;
        const CX = W / 2;
        const CY = y0;

        // 外圈金色光环
        ctx.beginPath();
        ctx.arc(CX, CY, AVATAR_R + 6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(200,162,88,0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 内圈金色边框
        ctx.beginPath();
        ctx.arc(CX, CY, AVATAR_R + 2, 0, Math.PI * 2);
        ctx.strokeStyle = '#C8A258';
        ctx.lineWidth = 2;
        ctx.stroke();

        // 头像
        if (avatarUrl) {
            try {
                const imgObj = await this.loadCanvasImage(canvas, avatarUrl);
                ctx.save();
                ctx.beginPath();
                ctx.arc(CX, CY, AVATAR_R, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(imgObj, CX - AVATAR_R, CY - AVATAR_R, AVATAR_R * 2, AVATAR_R * 2);
                ctx.restore();
            } catch (_) {
                ctx.beginPath();
                ctx.arc(CX, CY, AVATAR_R, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.12)';
                ctx.fill();
            }
        } else {
            ctx.beginPath();
            ctx.arc(CX, CY, AVATAR_R, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fill();
        }

        ctx.textAlign = 'center';
        if (showNickname) {
            const nick = (nickname || '好友').length > 10 ? `${(nickname || '').slice(0, 10)}…` : (nickname || '好友');
            ctx.fillStyle = '#FFF8F0';
            ctx.font = 'bold 30px sans-serif';
            ctx.fillText(nick, W / 2, CY + AVATAR_R + 42);
            return CY + AVATAR_R + 42;
        }
        return CY + AVATAR_R + 16;
    }

    // ─── wxacode 卡片（可失败降级） ──────────────────────

    /**
     * 尝试绘制小程序码；若失败，绘制邀请码文字作为降级方案。
     * @returns {{ success: boolean }} 是否成功绘制小程序码
     */
    async drawWxaCodeOrFallback(ctx, canvas, W, qy, QR, inviteCode) {
        try {
            const tmpPath = await this.fetchInviteWxaCodeToTempPath();
            if (!tmpPath) throw new Error('no_path');
            const qrImg = await this.loadCanvasImage(canvas, tmpPath);
            const qx = (W - QR) / 2;
            // 白底圆角卡片
            ctx.fillStyle = '#FFFFFF';
            fillRoundRect(ctx, qx - 16, qy - 16, QR + 32, QR + 32, 20);
            ctx.drawImage(qrImg, qx, qy, QR, QR);
            return { success: true };
        } catch (err) {
            console.warn('[InvitePosterCore] wxacode 绘制失败，降级为邀请码:', err.message);
            // 降级：绘制邀请码大字
            const bw = QR + 32;
            const bx = (W - bw) / 2;
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            fillRoundRect(ctx, bx, qy - 16, bw, QR + 32, 20);
            ctx.strokeStyle = 'rgba(200,162,88,0.4)';
            ctx.lineWidth = 1.5;
            strokeRoundRect(ctx, bx, qy - 16, bw, QR + 32, 20);
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255,248,240,0.5)';
            ctx.font = '20px sans-serif';
            ctx.fillText('搜索小程序进入', W / 2, qy + QR / 2 - 24);
            if (inviteCode) {
                ctx.fillStyle = '#D4A55A';
                ctx.font = 'bold 44px sans-serif';
                ctx.fillText(inviteCode, W / 2, qy + QR / 2 + 24);
            }
            return { success: false };
        }
    }

    // ─── 三种海报变体绘制 ────────────────────────────────

    /** 邀请语版：头像+昵称+邀请语+小程序码+数字码 */
    async drawPosterInvite(ctx, canvas, W, H, userInfo, inviteCode, brandName) {
        const normalizedUser = normalizeUserProfile(userInfo);
        await this.drawBaseCard(ctx, W, H, brandName);

        // 头像 + 昵称
        const nickBottom = await this.drawAvatarNick(
            ctx, canvas, W,
            getUserAvatar(normalizedUser),
            getUserNickname(normalizedUser) || '好友',
            150,
            { showNickname: true }
        );

        // 邀请语
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,248,240,0.65)';
        ctx.font = '26px sans-serif';
        ctx.fillText('邀请您来访', W / 2, nickBottom + 36);

        ctx.fillStyle = '#D4A55A';
        ctx.font = 'bold 44px sans-serif';
        ctx.fillText(brandName, W / 2, nickBottom + 92);

        ctx.fillStyle = 'rgba(255,248,240,0.4)';
        ctx.font = '20px sans-serif';
        ctx.fillText('扫码或填写下方邀请码', W / 2, nickBottom + 128);

        // 小程序码（失败时降级）
        const QR = 200;
        const qy = nickBottom + 148;
        await this.drawWxaCodeOrFallback(ctx, canvas, W, qy, QR, inviteCode);

        // 专属邀请码卡片
        const CODE_Y = qy + QR + 40;
        const CODE_W = 480;
        const CODE_H = 96;
        const CODE_X = (W - CODE_W) / 2;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        fillRoundRect(ctx, CODE_X, CODE_Y, CODE_W, CODE_H, 20);
        ctx.strokeStyle = 'rgba(200,162,88,0.4)';
        ctx.lineWidth = 1.5;
        strokeRoundRect(ctx, CODE_X, CODE_Y, CODE_W, CODE_H, 20);
        ctx.fillStyle = 'rgba(255,248,240,0.5)';
        ctx.font = '20px sans-serif';
        ctx.fillText('专属邀请码', W / 2, CODE_Y + 30);
        ctx.fillStyle = '#FFF8F0';
        ctx.font = 'bold 44px sans-serif';
        ctx.fillText(inviteCode || '——', W / 2, CODE_Y + 76);

        // 底部标语
        ctx.fillStyle = 'rgba(255,248,240,0.3)';
        ctx.font = '18px sans-serif';
        ctx.fillText(`${brandName} · 品质甄选`, W / 2, H - 36);
    }

    /** 官方码版：纯扫码海报 */
    async drawPosterWxacode(ctx, canvas, W, H, brandName) {
        await this.drawBaseCard(ctx, W, H, brandName);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFF8F0';
        ctx.font = 'bold 38px sans-serif';
        ctx.fillText('扫码进入小程序', W / 2, 140);
        ctx.fillStyle = 'rgba(255,248,240,0.5)';
        ctx.font = '24px sans-serif';
        ctx.fillText('欢迎来访 · 品质臻选', W / 2, 186);

        // 小程序码（大尺寸）
        const QR = 300;
        const qy = 240;
        await this.drawWxaCodeOrFallback(ctx, canvas, W, qy, QR, null);

        // 长按提示
        ctx.fillStyle = 'rgba(255,248,240,0.35)';
        ctx.font = '20px sans-serif';
        ctx.fillText('长按识别小程序码', W / 2, qy + QR + 56);

        ctx.fillStyle = 'rgba(255,248,240,0.25)';
        ctx.font = '18px sans-serif';
        ctx.fillText(brandName, W / 2, H - 36);
    }

    /** 创意版：票根风，不依赖小程序码 */
    async drawPosterCreative(ctx, canvas, W, H, userInfo, inviteCode, brandName) {
        const normalizedUser = normalizeUserProfile(userInfo);

        // 深色背景 + 斜线纹理
        ctx.fillStyle = '#141008';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(200,162,88,0.08)';
        ctx.lineWidth = 1.5;
        for (let i = -H; i < W + H; i += 40) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i + H, H);
            ctx.stroke();
        }

        // 标题区
        ctx.textAlign = 'center';
        ctx.fillStyle = '#D4A55A';
        ctx.font = 'bold 56px sans-serif';
        ctx.fillText('同频 · 臻选', W / 2, 180);
        ctx.fillStyle = 'rgba(255,248,240,0.75)';
        ctx.font = '26px sans-serif';
        ctx.fillText('和好看的人，买好物', W / 2, 232);
        const nick = getUserNickname(normalizedUser) || '我';
        ctx.fillStyle = 'rgba(255,248,240,0.45)';
        ctx.font = '22px sans-serif';
        ctx.fillText(`${nick.slice(0, 8)} 邀你一起逛 ${brandName}`, W / 2, 278);

        // 票根区
        const tw = 460;
        const th = 220;
        const tx = (W - tw) / 2;
        const ty = 340;
        ctx.fillStyle = 'rgba(46,34,24,0.94)';
        fillRoundRect(ctx, tx, ty, tw, th, 24);
        ctx.strokeStyle = '#C8A258';
        ctx.lineWidth = 2;
        strokeRoundRect(ctx, tx, ty, tw, th, 24);
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(tx + 24, ty + th / 2);
        ctx.lineTo(tx + tw - 24, ty + th / 2);
        ctx.strokeStyle = 'rgba(200,162,88,0.35)';
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,248,240,0.5)';
        ctx.font = '20px sans-serif';
        ctx.fillText('撕沿此线 · 邀请密令', W / 2, ty + 44);
        ctx.fillStyle = '#FFF8F0';
        ctx.font = 'bold 60px sans-serif';
        ctx.fillText(inviteCode || '——', W / 2, ty + 132);
        ctx.fillStyle = 'rgba(255,248,240,0.4)';
        ctx.font = '20px sans-serif';
        ctx.fillText('保存或分享海报即可邀请好友', W / 2, ty + 182);

        // 头像（小，底部）
        try {
            const avatarUrl = getUserAvatar(normalizedUser);
            if (avatarUrl) {
                const AR = 44;
                const ax = W / 2;
                const ay = ty + th + 80;
                const imgObj = await this.loadCanvasImage(canvas, avatarUrl);
                ctx.save();
                ctx.beginPath();
                ctx.arc(ax, ay, AR, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(imgObj, ax - AR, ay - AR, AR * 2, AR * 2);
                ctx.restore();
                ctx.beginPath();
                ctx.arc(ax, ay, AR + 2, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(200,162,88,0.5)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                const nickText = (nick).slice(0, 8);
                ctx.fillStyle = 'rgba(255,248,240,0.55)';
                ctx.font = '20px sans-serif';
                ctx.fillText(nickText, W / 2, ay + AR + 28);
            }
        } catch (_) { /* 头像可选 */ }

        ctx.fillStyle = 'rgba(255,248,240,0.25)';
        ctx.font = '18px sans-serif';
        ctx.fillText(`${brandName}`, W / 2, H - 36);
    }

    /**
     * 生成海报并导出临时路径
     * @returns {Promise<string>} 临时图片路径
     */
    async generateToTempPath({ variant, inviteCode, userInfo, brandName }) {
        await new Promise((resolve) => {
            if (typeof wx.nextTick === 'function') wx.nextTick(resolve);
            else resolve();
        });
        await sleep(32);
        const { canvas, ctx, W, H } = await this.getPosterCanvas2d();
        if (variant === 'wxacode') {
            await this.drawPosterWxacode(ctx, canvas, W, H, brandName);
        } else if (variant === 'creative') {
            await this.drawPosterCreative(ctx, canvas, W, H, userInfo, inviteCode, brandName);
        } else {
            await this.drawPosterInvite(ctx, canvas, W, H, userInfo, inviteCode, brandName);
        }
        return this.exportPoster(canvas);
    }
}

module.exports = { InvitePosterCore, POSTER_W, POSTER_H, clearWxacodeCache };
