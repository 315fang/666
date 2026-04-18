/**
 * 邀请海报 Canvas 绘制：顶部品牌视觉图 + 底部信息卡
 */
const { callFn } = require('../../../utils/cloud');

const POSTER_W = 600;
const POSTER_H = 760;
const PAGE_PAD = 18;
const CARD_RADIUS = 22;
/** 顶部主视觉与下方信息卡之间的间距（像素，避免「糊在一起」） */
const COVER_TO_CARD_GAP = 18;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function ellipsis(text, max = 8) {
    const value = String(text || '').trim();
    if (!value) return '微信用户';
    return value.length > max ? `${value.slice(0, max)}...` : value;
}

/** 官方主标题：优先按空格拆两行，避免与右侧二维码区域重叠 */
function splitBrandTitleLines(text) {
    const s = String(text || '').trim();
    if (!s) return [''];
    const sp = s.indexOf(' ');
    if (sp > 0 && sp < s.length - 1) {
        return [s.slice(0, sp), s.slice(sp + 1).trim()];
    }
    return [s];
}

class SharePosterCore {
    /**
     * @param {WechatMiniprogram.Page.Instance} wxPage
     * @param {{ canvasSelector?: string }} [options]
     */
    constructor(wxPage, options = {}) {
        this.page = wxPage;
        this.qrDrawError = null;
        this.canvasSelector = options.canvasSelector || '#sharePosterCanvas';
    }

    async getPosterCanvas2d() {
        await sleep(48);
        const query = wx.createSelectorQuery().in(this.page);
        const canvasNode = await new Promise((resolve, reject) => {
            query.select(this.canvasSelector).fields({ node: true, size: true }, (res) => {
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
        return { canvas, ctx, W: POSTER_W, H: POSTER_H, dpr };
    }

    async ensureTempFileReady(filePath) {
        if (!filePath) throw new Error('海报导出失败，未获得图片路径');
        const fs = typeof wx.getFileSystemManager === 'function' ? wx.getFileSystemManager() : null;
        if (!fs || typeof fs.getFileInfo !== 'function') return filePath;

        const info = await new Promise((resolve, reject) => {
            fs.getFileInfo({
                filePath,
                success: resolve,
                fail: reject
            });
        });

        if (!info || Number(info.size || 0) <= 0) {
            throw new Error('海报导出失败，图片文件为空');
        }
        return filePath;
    }

    async exportPoster(canvas, W, H, dpr) {
        let lastError = null;

        for (let attempt = 0; attempt < 2; attempt += 1) {
            if (attempt > 0) {
                await sleep(120);
            }

            try {
                const tempFilePath = await new Promise((resolve, reject) => {
                    wx.canvasToTempFilePath({
                        canvas,
                        x: 0,
                        y: 0,
                        width: W,
                        height: H,
                        destWidth: Math.round(W * dpr),
                        destHeight: Math.round(H * dpr),
                        fileType: 'jpg',
                        quality: 0.94,
                        success: (res) => resolve(res.tempFilePath),
                        fail: reject
                    });
                });

                await sleep(48);
                return await this.ensureTempFileReady(tempFilePath);
            } catch (err) {
                lastError = err;
            }
        }

        throw lastError || new Error('海报导出失败');
    }

    async normalizeImageSource(src) {
        if (!src) return '';
        if (/^https?:\/\//i.test(src)) {
            try {
                const info = await new Promise((resolve, reject) => {
                    wx.getImageInfo({
                        src,
                        success: resolve,
                        fail: reject
                    });
                });
                return info.path || src;
            } catch (_) {
                return src;
            }
        }
        return src;
    }

    async loadCanvasImage(canvas, src) {
        const normalizedSrc = await this.normalizeImageSource(src);
        return new Promise((resolve, reject) => {
            const img = canvas.createImage();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`图片加载失败: ${src}`));
            img.src = normalizedSrc;
        });
    }

    async fetchWxaCodeToTempPath() {
        const res = await callFn('distribution', { action: 'wxacodeInvite' }, { showError: false });
        const fs = wx.getFileSystemManager();
        const root = wx.env && wx.env.USER_DATA_PATH;
        if (!root) throw new Error('请升级微信版本后重试');
        const filePath = `${root}/share_wxacode_template.png`;

        // 云函数 success({ wxacode_base64 })，callFn 会展开到顶层；旧版可能直接返回 buffer
        const base64 = res && (res.wxacode_base64 || (res.data && res.data.wxacode_base64));
        const buf = res && res.buffer;

        if (buf) {
            await new Promise((resolve, reject) => {
                fs.writeFile({ filePath, data: buf, success: resolve, fail: reject });
            });
            return filePath;
        }

        if (base64) {
            await new Promise((resolve, reject) => {
                fs.writeFile({
                    filePath,
                    data: base64,
                    encoding: 'base64',
                    success: resolve,
                    fail: reject
                });
            });
            return filePath;
        }

        const apiErr = res && res.error;
        const hint = apiErr && String(apiErr) !== 'empty_buffer' ? String(apiErr) : '';
        throw new Error(hint ? `小程序码生成失败（${hint}）` : '小程序码暂不可用，请稍后重试');
    }

    roundRectPath(ctx, x, y, w, h, r) {
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

    fillRoundRect(ctx, x, y, w, h, r, color) {
        this.roundRectPath(ctx, x, y, w, h, r);
        ctx.fillStyle = color;
        ctx.fill();
    }

    strokeRoundRect(ctx, x, y, w, h, r, color, width = 1) {
        this.roundRectPath(ctx, x, y, w, h, r);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
    }

    async drawIdentityAvatar(ctx, canvas, options = {}) {
        const {
            x = 0,
            y = 0,
            size = 64,
            avatarSource = '',
            fallbackLabel = '',
            fallbackBg = '#E9E1D6',
            fallbackColor = '#6D5A45'
        } = options;

        if (avatarSource) {
            try {
                const avatar = await this.loadCanvasImage(canvas, avatarSource);
                ctx.save();
                ctx.beginPath();
                ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(avatar, x, y, size, size);
                ctx.restore();
                return;
            } catch (_) {
                // fallback below
            }
        }

        this.fillRoundRect(ctx, x, y, size, size, size / 2, fallbackBg);

        if (fallbackLabel) {
            ctx.save();
            ctx.fillStyle = fallbackColor;
            ctx.font = '700 22px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(fallbackLabel).slice(0, 2), x + size / 2, y + size / 2 + 1);
            ctx.restore();
        }
    }

    async drawCoverSection(ctx, canvas, W, coverUrl, brandName) {
        const coverX = PAGE_PAD;
        const coverY = PAGE_PAD;
        const coverW = W - PAGE_PAD * 2;
        const coverH = 470;

        this.fillRoundRect(ctx, coverX, coverY, coverW, coverH, CARD_RADIUS, '#DCE5EE');

        if (coverUrl) {
            try {
                const img = await this.loadCanvasImage(canvas, coverUrl);
                ctx.save();
                this.roundRectPath(ctx, coverX, coverY, coverW, coverH, CARD_RADIUS);
                ctx.clip();

                const imgRatio = img.width / img.height;
                const boxRatio = coverW / coverH;
                let drawW = coverW;
                let drawH = coverH;
                let drawX = coverX;
                let drawY = coverY;

                if (imgRatio > boxRatio) {
                    drawH = coverH;
                    drawW = drawH * imgRatio;
                    drawX = coverX - (drawW - coverW) / 2;
                } else {
                    drawW = coverW;
                    drawH = drawW / imgRatio;
                    drawY = coverY - (drawH - coverH) / 2;
                }

                ctx.drawImage(img, drawX, drawY, drawW, drawH);
                ctx.restore();
                return { coverX, coverY, coverW, coverH };
            } catch (_) {
                // fallback below
            }
        }

        const grad = ctx.createLinearGradient(coverX, coverY, coverX + coverW, coverY + coverH);
        grad.addColorStop(0, '#DCE7F2');
        grad.addColorStop(0.52, '#A8BED6');
        grad.addColorStop(1, '#6E88A6');
        this.fillRoundRect(ctx, coverX, coverY, coverW, coverH, CARD_RADIUS, grad);

        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = '#FFFFFF';
        for (let i = 0; i < 5; i += 1) {
            ctx.beginPath();
            ctx.arc(coverX + 90 + i * 96, coverY + 92 + (i % 2) * 40, 54 + i * 6, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 96px serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(brandName || 'WL').slice(0, 2).toUpperCase(), coverX + coverW / 2, coverY + 275);

        ctx.font = '600 22px sans-serif';
        ctx.fillText('扫码了解品牌', coverX + coverW / 2, coverY + 326);
        return { coverX, coverY, coverW, coverH };
    }

    async drawPoster(ctx, canvas, W, H, userInfo, brandName, inviteCode, brandConfig = {}, posterVariant = 'personal') {
        ctx.fillStyle = '#F6F4EF';
        ctx.fillRect(0, 0, W, H);

        const cover = await this.drawCoverSection(ctx, canvas, W, brandConfig.share_poster_cover_url || '', brandName);

        const cardX = PAGE_PAD + 14;
        // 信息区放在主视觉下方，与封面分离（不再用负偏移压在图上）
        const cardY = cover.coverY + cover.coverH + COVER_TO_CARD_GAP;
        const cardW = W - (PAGE_PAD + 14) * 2;
        const cardH = 230;

        this.fillRoundRect(ctx, cardX, cardY, cardW, cardH, CARD_RADIUS, '#FFFFFF');
        this.strokeRoundRect(ctx, cardX, cardY, cardW, cardH, CARD_RADIUS, 'rgba(43,33,24,0.06)', 1);

        const isBrandVariant = posterVariant === 'brand';
        const avatarSize = 66;
        const avatarX = cardX + 28;
        const avatarY = cardY + 44;
        const textStartX = cardX + 28;
        const nameX = isBrandVariant ? textStartX : (avatarX + avatarSize + 18);
        const nameY = avatarY + 28;
        const memberCode = inviteCode || userInfo?.member_no || userInfo?.my_invite_code || '';
        const qrBoxSize = 170;
        const qrBoxX = cardX + cardW - qrBoxSize - 22;
        const qrBoxY = cardY + 28;
        /** 文案区右边界（与二维码留白），避免后绘制的码区盖住文字 */
        const textColumnRight = qrBoxX - 14;

        const displayName = isBrandVariant
            ? String(brandConfig.official_promo_title || brandConfig.poster_brand_display_name || brandName || '品牌官方').trim()
            : ellipsis(userInfo?.nick_name || userInfo?.nickname || userInfo?.nickName || '微信用户', 9);
        const introText = isBrandVariant
            ? String(brandConfig.official_promo_subtitle || '').trim()
            : (brandConfig.share_poster_intro || '专注于大学生（产教融合）实战落地');
        const codePrefix = brandConfig.share_poster_code_prefix || '我的ID：';
        const qrHint = brandConfig.share_poster_qr_hint || '长按识别小程序码';
        const highlightLine = isBrandVariant
            ? (brandConfig.official_promo_footer || '扫码查看官方宣传')
            : `${codePrefix}${memberCode || '未配置'}`;
        const brandHasIntro = isBrandVariant && !!introText;

        if (!isBrandVariant) {
            await this.drawIdentityAvatar(ctx, canvas, {
                x: avatarX,
                y: avatarY,
                size: avatarSize,
                avatarSource: userInfo.avatar || userInfo.avatar_url || userInfo.avatarUrl || '',
                fallbackLabel: '',
                fallbackBg: '#E9E1D6',
                fallbackColor: '#6D5A45'
            });
        } else {
            this.fillRoundRect(ctx, textStartX, cardY + 36, 112, 36, 18, '#F1E3CA');
            ctx.save();
            ctx.fillStyle = '#8E6A34';
            ctx.font = '600 18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(brandConfig.official_promo_badge || '官方宣传').slice(0, 6), textStartX + 56, cardY + 54);
            ctx.restore();
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(textStartX, cardY + 20, Math.max(0, textColumnRight - textStartX), cardH - 36);
        ctx.clip();

        ctx.fillStyle = '#2B2118';
        ctx.font = isBrandVariant ? '700 32px sans-serif' : '700 28px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        let titleExtraLines = 0;
        if (isBrandVariant) {
            const titleLines = splitBrandTitleLines(displayName);
            const titleLineY = cardY + 108;
            const titleLineGap = 36;
            titleLines.forEach((line, idx) => {
                ctx.fillText(line, nameX, titleLineY + idx * titleLineGap);
            });
            titleExtraLines = Math.max(0, titleLines.length - 1);
        } else {
            ctx.fillText(displayName, nameX, nameY);
        }

        ctx.fillStyle = '#3F3328';
        ctx.font = '600 17px sans-serif';
        const introShift = titleExtraLines * 36;
        if (!isBrandVariant) {
            ctx.fillText(introText, textStartX, cardY + 132);
        } else if (brandHasIntro) {
            ctx.fillText(introText, textStartX, cardY + 150 + introShift);
        }

        ctx.fillStyle = '#B74848';
        ctx.font = '600 17px sans-serif';
        const highlightY = isBrandVariant
            ? (brandHasIntro ? cardY + 194 : cardY + 158) + introShift
            : cardY + 182;
        ctx.fillText(highlightLine, textStartX, highlightY);

        ctx.restore();

        this.fillRoundRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 18, '#FBFAF7');

        try {
            const qrPath = await this.fetchWxaCodeToTempPath();
            const qrImage = await this.loadCanvasImage(canvas, qrPath);
            ctx.drawImage(qrImage, qrBoxX + 8, qrBoxY + 8, qrBoxSize - 16, qrBoxSize - 16);
        } catch (err) {
            this.qrDrawError = err;
            ctx.fillStyle = '#D9D0C3';
            ctx.font = '600 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('二维码生成失败', qrBoxX + qrBoxSize / 2, qrBoxY + qrBoxSize / 2);
        }

        ctx.fillStyle = '#8A7B6A';
        ctx.font = '500 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(qrHint, qrBoxX + qrBoxSize / 2, qrBoxY + qrBoxSize + 18);

        // 二维码失败时已在画布上占位提示，仍导出整张海报，避免因 throw 导致「Error: ok」类误报
    }

    async generateToTempPath({ userInfo, brandName, inviteCode, brandConfig, posterVariant = 'personal' }) {
        this.qrDrawError = null;
        await new Promise((resolve) => {
            if (typeof wx.nextTick === 'function') wx.nextTick(resolve);
            else resolve();
        });
        await sleep(32);
        const { canvas, ctx, W, H, dpr } = await this.getPosterCanvas2d();
        await this.drawPoster(ctx, canvas, W, H, userInfo, brandName, inviteCode, brandConfig, posterVariant);
        await sleep(80);
        return this.exportPoster(canvas, W, H, dpr);
    }
}

module.exports = { SharePosterCore, POSTER_W, POSTER_H };
