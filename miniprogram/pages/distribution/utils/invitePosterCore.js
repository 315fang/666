/**
 * 邀请海报 Canvas 绘制（独立「邀请海报」页使用；团队页通过跳转进入该页）
 */
const { getApiBaseUrl } = require('../../../config/env');
const requestConfig = require('../../../utils/request').config;
const { getUserAvatar, getUserNickname, normalizeUserProfile } = require('../../../utils/userProfile');

const POSTER_W = 600;
const POSTER_H = 900;

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
        const token = wx.getStorageSync('token') || '';
        const openid = wx.getStorageSync('openid') || '';
        const baseUrl = (requestConfig && requestConfig.baseUrl) || getApiBaseUrl().replace(/\/+$/, '');
        const url = `${baseUrl}/distribution/wxacode-invite`;
        const buf = await new Promise((resolve, reject) => {
            wx.request({
                url,
                method: 'GET',
                header: {
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-openid': openid
                },
                responseType: 'arraybuffer',
                success: (res) => {
                    if (res.statusCode !== 200 || !res.data) {
                        reject(new Error('官方码接口失败'));
                        return;
                    }
                    const u8 = new Uint8Array(res.data);
                    if (u8.length && u8[0] === 0x7b) {
                        try {
                            const txt = String.fromCharCode.apply(null, u8.slice(0, Math.min(800, u8.length)));
                            const j = JSON.parse(txt);
                            reject(new Error(j.message || '官方码生成失败'));
                        } catch (e) {
                            reject(new Error('官方码生成失败'));
                        }
                        return;
                    }
                    resolve(res.data);
                },
                fail: reject
            });
        });
        const fs = wx.getFileSystemManager();
        const root = wx.env && wx.env.USER_DATA_PATH;
        if (!root) {
            throw new Error('请升级微信版本后重试官方码');
        }
        const filePath = `${root}/invite_wxacode_tmp.png`;
        await new Promise((resolve, reject) => {
            fs.writeFile({
                filePath,
                data: buf,
                success: resolve,
                fail: reject
            });
        });
        return filePath;
    }

    async drawBaseCard(ctx, W, H, brandName) {
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#2E2218');
        bg.addColorStop(0.55, '#4A3527');
        bg.addColorStop(1, '#3C2C1E');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 0.06;
        ctx.beginPath();
        ctx.arc(W - 60, 80, 200, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(60, H - 80, 160, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,248,240,0.55)';
        ctx.font = '26px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(brandName, W / 2, 56);
    }

    async drawAvatarNick(ctx, canvas, W, avatarUrl, nickname, y0, opts = {}) {
        const showNickname = opts.showNickname !== false;
        const AVATAR_R = 64;
        const AVATAR_X = W / 2;
        const AVATAR_Y = y0;
        if (avatarUrl) {
            try {
                const imgObj = await this.loadCanvasImage(canvas, avatarUrl);
                ctx.save();
                ctx.beginPath();
                ctx.arc(AVATAR_X, AVATAR_Y, AVATAR_R, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(imgObj, AVATAR_X - AVATAR_R, AVATAR_Y - AVATAR_R, AVATAR_R * 2, AVATAR_R * 2);
                ctx.restore();
            } catch (_) {
                ctx.beginPath();
                ctx.arc(AVATAR_X, AVATAR_Y, AVATAR_R, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.18)';
                ctx.fill();
            }
        } else {
            ctx.beginPath();
            ctx.arc(AVATAR_X, AVATAR_Y, AVATAR_R, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.18)';
            ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(AVATAR_X, AVATAR_Y, AVATAR_R + 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#C8A258';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.textAlign = 'center';
        if (showNickname) {
            ctx.fillStyle = '#FFF8F0';
            ctx.font = 'bold 32px sans-serif';
            const nick = nickname.length > 10 ? `${nickname.slice(0, 10)}…` : nickname;
            ctx.fillText(nick, W / 2, AVATAR_Y + AVATAR_R + 44);
            return AVATAR_Y + AVATAR_R + 44;
        }
        return AVATAR_Y + AVATAR_R + 16;
    }

    /** 拉取邀请场景小程序码并画在白底圆角卡片内（与后端 scene i=邀请码 一致） */
    async drawWxaCodeOnCard(ctx, canvas, W, qy, QR) {
        const tmpPath = await this.fetchInviteWxaCodeToTempPath();
        const qrImg = await this.loadCanvasImage(canvas, tmpPath);
        const qx = (W - QR) / 2;
        ctx.fillStyle = '#FFFFFF';
        fillRoundRect(ctx, qx - 12, qy - 12, QR + 24, QR + 24, 16);
        ctx.drawImage(qrImg, qx, qy, QR, QR);
    }

    async drawPosterInvite(ctx, canvas, W, H, userInfo, inviteCode, brandName) {
        const normalizedUser = normalizeUserProfile(userInfo);
        await this.drawBaseCard(ctx, W, H, brandName);
        const nickBottom = await this.drawAvatarNick(
            ctx,
            canvas,
            W,
            getUserAvatar(normalizedUser),
            getUserNickname(normalizedUser) || '好友',
            150,
            { showNickname: false }
        );
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFF8F0';
        ctx.font = 'bold 30px sans-serif';
        ctx.fillText('邀请您来访', W / 2, nickBottom + 34);
        ctx.fillStyle = '#D4A55A';
        ctx.font = 'bold 40px sans-serif';
        ctx.fillText(brandName, W / 2, nickBottom + 88);
        ctx.fillStyle = 'rgba(255,248,240,0.5)';
        ctx.font = '20px sans-serif';
        ctx.fillText('扫码或填写下方邀请码', W / 2, nickBottom + 124);
        const QR = 200;
        const qy = nickBottom + 138;
        await this.drawWxaCodeOnCard(ctx, canvas, W, qy, QR);
        const CODE_Y = qy + QR + 28;
        const CODE_W = 480;
        const CODE_H = 92;
        const CODE_X = (W - CODE_W) / 2;
        ctx.fillStyle = 'rgba(255,255,255,0.10)';
        fillRoundRect(ctx, CODE_X, CODE_Y, CODE_W, CODE_H, 20);
        ctx.strokeStyle = 'rgba(200,162,88,0.45)';
        ctx.lineWidth = 1.5;
        strokeRoundRect(ctx, CODE_X, CODE_Y, CODE_W, CODE_H, 20);
        ctx.fillStyle = 'rgba(255,248,240,0.5)';
        ctx.font = '20px sans-serif';
        ctx.fillText('专属邀请码', W / 2, CODE_Y + 28);
        ctx.fillStyle = '#FFF8F0';
        ctx.font = 'bold 40px sans-serif';
        ctx.fillText(inviteCode || '——', W / 2, CODE_Y + 72);
        ctx.fillStyle = 'rgba(255,248,240,0.35)';
        ctx.font = '20px sans-serif';
        ctx.fillText(`${brandName} · 品质甄选`, W / 2, H - 40);
    }

    async drawPosterWxacode(ctx, canvas, W, H, brandName) {
        await this.drawBaseCard(ctx, W, H, brandName);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFF8F0';
        ctx.font = 'bold 34px sans-serif';
        ctx.fillText('扫码进入小程序', W / 2, 128);
        ctx.fillStyle = 'rgba(255,248,240,0.55)';
        ctx.font = '22px sans-serif';
        ctx.fillText('欢迎来访', W / 2, 172);
        await this.drawWxaCodeOnCard(ctx, canvas, W, 220, 280);
        ctx.fillStyle = 'rgba(255,248,240,0.35)';
        ctx.font = '20px sans-serif';
        ctx.fillText(brandName, W / 2, H - 40);
    }

    async drawPosterCreative(ctx, canvas, W, H, userInfo, inviteCode, brandName) {
        const normalizedUser = normalizeUserProfile(userInfo);
        ctx.fillStyle = '#1a1410';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(200,162,88,0.12)';
        ctx.lineWidth = 2;
        for (let i = -W; i < W + H; i += 36) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i + H, H);
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(212,165,90,0.95)';
        ctx.font = 'bold 52px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('同频 · 臻选', W / 2, 200);
        ctx.fillStyle = 'rgba(255,248,240,0.85)';
        ctx.font = '26px sans-serif';
        ctx.fillText('和好看的人，买好物', W / 2, 248);
        ctx.fillStyle = 'rgba(255,248,240,0.45)';
        ctx.font = '22px sans-serif';
        const sub = `${(getUserNickname(normalizedUser) || '我').slice(0, 8)} 邀你一起逛 ${brandName}`;
        ctx.fillText(sub, W / 2, 300);
        const tw = 440;
        const th = 200;
        const tx = (W - tw) / 2;
        const ty = 360;
        ctx.fillStyle = 'rgba(46,34,24,0.92)';
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
        ctx.textAlign = 'center';
        ctx.fillText('撕沿此线 · 邀请密令', W / 2, ty + 42);
        ctx.fillStyle = '#FFF8F0';
        ctx.font = 'bold 56px sans-serif';
        ctx.fillText(inviteCode || '——', W / 2, ty + 118);
        ctx.fillStyle = 'rgba(255,248,240,0.4)';
        ctx.font = '20px sans-serif';
        ctx.fillText('保存或分享海报即可邀请好友', W / 2, ty + 168);
        ctx.fillStyle = 'rgba(255,248,240,0.3)';
        ctx.font = '18px sans-serif';
        ctx.fillText(`${brandName}`, W / 2, H - 36);
    }

    /**
     * @returns {Promise<string>} 临时图片路径
     */
    async generateToTempPath({ variant, inviteCode, userInfo, brandName }) {
        await new Promise((resolve) => {
            if (typeof wx.nextTick === 'function') wx.nextTick(resolve);
            else resolve();
        });
        await sleep(32);
        const { canvas, ctx, W, H } = await this.getPosterCanvas2d();
        if (variant === 'invite') {
            await this.drawPosterInvite(ctx, canvas, W, H, userInfo, inviteCode, brandName);
        } else if (variant === 'wxacode') {
            await this.drawPosterWxacode(ctx, canvas, W, H, brandName);
        } else {
            await this.drawPosterCreative(ctx, canvas, W, H, userInfo, inviteCode, brandName);
        }
        return this.exportPoster(canvas);
    }
}

module.exports = { InvitePosterCore, POSTER_W, POSTER_H };
