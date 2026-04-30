const { callFn } = require('../../../utils/cloud');

const POSTER_W = 600;
const POSTER_H = 860;
const PAGE_PAD = 26;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeText(value, fallback = '') {
    const text = value == null ? '' : String(value).trim();
    return text || fallback;
}

class ProductPosterCore {
    constructor(wxPage, options = {}) {
        this.page = wxPage;
        this.canvasSelector = options.canvasSelector || '#productPosterCanvas';
        this.qrDrawError = null;
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
            fs.getFileInfo({ filePath, success: resolve, fail: reject });
        });
        if (!info || Number(info.size || 0) <= 0) {
            throw new Error('海报导出失败，图片文件为空');
        }
        return filePath;
    }

    async exportPoster(canvas, W, H, dpr) {
        let lastError = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            if (attempt > 0) await sleep(120);
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
                        quality: 0.95,
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
                    wx.getImageInfo({ src, success: resolve, fail: reject });
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

    async fetchProductWxaCodeToTempPath(productId, inviteCode = '', coupon = null) {
        const res = await callFn('products', {
            action: 'wxacodeProduct',
            product_id: productId,
            invite_code: inviteCode || '',
            coupon_id: coupon && (coupon.coupon_id || coupon.id) || '',
            ticket: coupon && (coupon.ticket || coupon.ticket_id) || ''
        }, { showError: false });
        const fs = wx.getFileSystemManager();
        const root = wx.env && wx.env.USER_DATA_PATH;
        if (!root) throw new Error('请升级微信版本后重试');
        const couponKey = coupon && (coupon.coupon_id || coupon.id || coupon.ticket || coupon.ticket_id)
            ? `_${String(coupon.coupon_id || coupon.id || coupon.ticket || coupon.ticket_id).replace(/[^a-z0-9_-]/ig, '_')}`
            : '';
        const filePath = `${root}/product_wxacode_${String(productId).replace(/[^a-z0-9_-]/ig, '_')}${couponKey}.png`;
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
                fs.writeFile({ filePath, data: base64, encoding: 'base64', success: resolve, fail: reject });
            });
            return filePath;
        }
        const apiErr = res && res.error;
        throw new Error(apiErr ? String(apiErr) : '小程序码暂不可用，请稍后重试');
    }

    drawCouponBadge(ctx, coupon, x, y, w) {
        if (!coupon) return 0;
        const valueText = safeText(coupon.valueText || coupon.value_text, '');
        const title = safeText(coupon.poster_badge_text || coupon.coupon_name || coupon.name, '扫码领券');
        const threshold = safeText(coupon.thresholdText || coupon.threshold_text, '');
        if (!valueText && !title) return 0;

        const h = 54;
        this.fillRoundRect(ctx, x, y, w, h, 14, '#FFF2F1');
        ctx.save();
        ctx.fillStyle = '#D93448';
        ctx.font = '700 27px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(valueText || '领券', x + 16, y + h / 2);
        const leftWidth = Math.max(66, ctx.measureText(valueText || '领券').width + 28);
        ctx.strokeStyle = 'rgba(217, 52, 72, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + leftWidth, y + 11);
        ctx.lineTo(x + leftWidth, y + h - 11);
        ctx.stroke();
        ctx.fillStyle = '#8A3B40';
        ctx.font = '600 19px sans-serif';
        const copy = threshold ? `${title} · ${threshold}` : title;
        this.wrapText(ctx, copy, x + leftWidth + 14, y + 34, Math.max(80, w - leftWidth - 28), 22, 1);
        ctx.restore();
        return h;
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

    drawCoverFallback(ctx, x, y, w, h, productName = '') {
        const grad = ctx.createLinearGradient(x, y, x + w, y + h);
        grad.addColorStop(0, '#DCE7F2');
        grad.addColorStop(0.56, '#AFC4D8');
        grad.addColorStop(1, '#6F8EAD');
        this.fillRoundRect(ctx, x, y, w, h, 0, grad);
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        ctx.font = '700 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(safeText(productName, '问兰甄选').slice(0, 8), x + w / 2, y + h / 2);
        ctx.restore();
    }

    async drawProductImage(ctx, canvas, product) {
        const x = PAGE_PAD;
        const y = PAGE_PAD;
        const w = POSTER_W - PAGE_PAD * 2;
        const h = 536;

        ctx.save();
        ctx.fillStyle = '#EEF4F8';
        ctx.fillRect(x, y, w, h);
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        if (product.image) {
            try {
                const img = await this.loadCanvasImage(canvas, product.image);
                const imgRatio = img.width / img.height;
                const boxRatio = w / h;
                let drawW = w;
                let drawH = h;
                let drawX = x;
                let drawY = y;

                if (imgRatio > boxRatio) {
                    drawH = h;
                    drawW = drawH * imgRatio;
                    drawX = x - (drawW - w) / 2;
                } else {
                    drawW = w;
                    drawH = drawW / imgRatio;
                    drawY = y - (drawH - h) / 2;
                }
                ctx.drawImage(img, drawX, drawY, drawW, drawH);
                ctx.restore();
                return { x, y, w, h };
            } catch (_) {
                // fallback below
            }
        }

        this.drawCoverFallback(ctx, x, y, w, h, product.name);
        ctx.restore();
        return { x, y, w, h };
    }

    drawStrikethroughText(ctx, text, x, y) {
        if (!text) return;
        ctx.fillText(text, x, y);
        const width = ctx.measureText(text).width;
        ctx.save();
        ctx.strokeStyle = '#9298A1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y - 9);
        ctx.lineTo(x + width, y - 9);
        ctx.stroke();
        ctx.restore();
    }

    wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
        const source = safeText(text, '问兰甄选好物');
        const lines = [];
        let line = '';

        for (let i = 0; i < source.length; i += 1) {
            const testLine = line + source[i];
            if (ctx.measureText(testLine).width > maxWidth && line) {
                lines.push(line);
                line = source[i];
                if (lines.length === maxLines - 1) break;
            } else {
                line = testLine;
            }
        }

        const consumed = lines.join('').length + line.length;
        if (consumed < source.length && maxLines > 0) {
            while (line && ctx.measureText(`${line}...`).width > maxWidth) {
                line = line.slice(0, -1);
            }
            line = `${line}...`;
        }
        if (line) lines.push(line);

        lines.slice(0, maxLines).forEach((item, index) => {
            ctx.fillText(item, x, y + index * lineHeight);
        });
    }

    async drawInfoSection(ctx, canvas, product, options = {}) {
        const top = PAGE_PAD + 536;
        const qrSize = 154;
        const qrX = POSTER_W - PAGE_PAD - qrSize - 10;
        const qrY = top + 72;
        const textX = PAGE_PAD + 12;
        const textRight = qrX - 28;
        const titleMaxWidth = Math.max(220, textRight - textX);

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, top, POSTER_W, POSTER_H - top);

        ctx.save();
        ctx.fillStyle = '#D93448';
        ctx.font = '700 24px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('¥', textX, top + 76);
        ctx.font = '700 52px sans-serif';
        ctx.fillText(safeText(product.price, '0'), textX + 30, top + 78);

        const priceWidth = ctx.measureText(safeText(product.price, '0')).width;
        if (product.marketPrice && product.marketPrice !== product.price) {
            ctx.fillStyle = '#9298A1';
            ctx.font = '500 26px sans-serif';
            this.drawStrikethroughText(ctx, `¥${product.marketPrice}`, textX + 48 + priceWidth, top + 74);
        }

        ctx.fillStyle = '#202124';
        ctx.font = '500 34px sans-serif';
        this.wrapText(ctx, product.name, textX, top + 150, titleMaxWidth, 48, 2);

        const coupon = options.coupon || null;
        const couponY = top + 244;
        if (coupon) {
            this.drawCouponBadge(ctx, coupon, textX, couponY, titleMaxWidth);
        } else if (product.specText) {
            ctx.fillStyle = '#8A8F98';
            ctx.font = '500 22px sans-serif';
            this.wrapText(ctx, product.specText, textX, top + 256, titleMaxWidth, 30, 1);
        }

        this.fillRoundRect(ctx, qrX, qrY, qrSize, qrSize, 18, '#F6F7F8');
        try {
            const qrPath = await this.fetchProductWxaCodeToTempPath(product.id, options.inviteCode || '', coupon);
            const qrImage = await this.loadCanvasImage(canvas, qrPath);
            ctx.drawImage(qrImage, qrX + 8, qrY + 8, qrSize - 16, qrSize - 16);
        } catch (err) {
            this.qrDrawError = err;
            ctx.fillStyle = '#8A8F98';
            ctx.font = '600 17px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('小程序码暂不可用', qrX + qrSize / 2, qrY + qrSize / 2);
        }

        ctx.fillStyle = '#9CA3AF';
        ctx.font = '500 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('长按识别小程序码', qrX + qrSize / 2, qrY + qrSize + 42);
        ctx.restore();
    }

    async drawPoster(ctx, canvas, W, H, product, options = {}) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, W, H);
        await this.drawProductImage(ctx, canvas, product);
        await this.drawInfoSection(ctx, canvas, product, options);
    }

    async generateToTempPath({ product, inviteCode = '', coupon = null }) {
        this.qrDrawError = null;
        await new Promise((resolve) => {
            if (typeof wx.nextTick === 'function') wx.nextTick(resolve);
            else resolve();
        });
        await sleep(32);
        const { canvas, ctx, W, H, dpr } = await this.getPosterCanvas2d();
        await this.drawPoster(ctx, canvas, W, H, product, { inviteCode, coupon });
        await sleep(80);
        return this.exportPoster(canvas, W, H, dpr);
    }
}

module.exports = { ProductPosterCore, POSTER_W, POSTER_H };
