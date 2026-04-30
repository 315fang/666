// components/brand-animation/brand-animation.js
Component({
    properties: {
        // 动画类型: withdraw, payment, joinTeam, welcome, levelUp
        type: {
            type: String,
            optionalTypes: [Number, Boolean],
            value: '',
            observer: function() {
                this._syncDisplayState();
            }
        },
        // 提现金额
        amount: {
            type: String,
            optionalTypes: [Number],
            value: '0.00'
        },
        // 团队名称
        teamName: {
            type: String,
            optionalTypes: [Number],
            value: '',
            observer: function() {
                this._syncDisplayState();
            }
        },
        // 等级名称（晋级动画用）
        levelName: {
            type: String,
            optionalTypes: [Number],
            value: '',
            observer: function() {
                this._syncDisplayState();
            }
        },
        // 飞入购物袋的图片
        flyImage: {
            type: String,
            optionalTypes: [Number],
            value: ''
        }
    },

    data: {
        show: false,
        brandName: '问兰',
        flyToCart: false,
        flyX: 0,
        flyY: 0,
        showToastCheck: false,
        toastText: '已复制',
        slideOut: false,
        slideOutCard: false,
        cartBounce: false,
        addCount: 1,
        overlayClass: 'brand-animation-overlay',
        toastCheckClass: 'toast-check',
        cartBounceClass: 'cart-badge-bounce',
        displayBrandName: '问兰',
        displayTeamName: '问兰大家庭',
        displayLevelName: '',
        displayToastText: '已复制',
        displayAddCount: 1,
        isWithdraw: false,
        isPayment: false,
        isJoinTeam: false,
        isWelcome: false,
        isLevelUp: false
    },

    attached() {
        const app = getApp();
        if (app && app.globalData.brandName) {
            this._setDisplayData({ brandName: app.globalData.brandName });
            return;
        }
        this._syncDisplayState();
    },

    methods: {
        _buildDisplayPatch(patch = {}) {
            const next = Object.assign({}, this.data, patch);
            const type = String(next.type || '');
            const brandName = String(next.brandName || '问兰').trim() || '问兰';
            const teamName = String(next.teamName || '').trim() || (brandName + '大家庭');
            const levelName = String(next.levelName || '');
            const toastText = String(next.toastText || '已复制').trim() || '已复制';
            const addCount = Number(next.addCount || 1) || 1;
            return {
                overlayClass: next.show ? 'brand-animation-overlay show' : 'brand-animation-overlay',
                toastCheckClass: next.showToastCheck ? 'toast-check show' : 'toast-check',
                cartBounceClass: next.cartBounce ? 'cart-badge-bounce bounce' : 'cart-badge-bounce',
                displayBrandName: brandName,
                displayTeamName: teamName,
                displayLevelName: levelName,
                displayToastText: toastText,
                displayAddCount: addCount,
                isWithdraw: type === 'withdraw',
                isPayment: type === 'payment',
                isJoinTeam: type === 'joinTeam',
                isWelcome: type === 'welcome',
                isLevelUp: type === 'levelUp'
            };
        },

        _setDisplayData(patch) {
            this.setData(Object.assign({}, patch, this._buildDisplayPatch(patch)));
        },

        _syncDisplayState() {
            this.setData(this._buildDisplayPatch());
        },

        // ====== 层级一：全屏品牌动画 ======

        /**
         * 显示品牌动画
         * @param {string} type - 动画类型: withdraw, payment, joinTeam, welcome, levelUp
         * @param {object} options - 可选参数 { amount, teamName, levelName }
         */
        show(type, options = {}) {
            this._setDisplayData({
                show: true,
                type: type || this.data.type,
                amount: options.amount || '0.00',
                teamName: options.teamName || '',
                levelName: options.levelName || ''
            });

            // 根据动画类型决定持续时间
            const duration = type === 'levelUp' ? 2000 : 1500;

            // 自动关闭
            this._autoCloseTimer = setTimeout(() => {
                this.hide();
            }, duration);
        },

        // 隐藏动画
        hide() {
            if (this._autoCloseTimer) {
                clearTimeout(this._autoCloseTimer);
                this._autoCloseTimer = null;
            }
            this._setDisplayData({ show: false });
            this.triggerEvent('close');
        },

        // 点击遮罩关闭
        onTap() {
            this.hide();
        },

        stopProp() { },

        // ====== 层级二：飞入购物袋动画 ======
        /**
         * 商品图片飞向购物袋
         * @param {number} startX - 起始X
         * @param {number} startY - 起始Y
         * @param {number} endX   - 目标X（购物袋图标位置）
         * @param {number} endY   - 目标Y
         * @param {string} image  - 商品图片URL
         * @returns {Promise}
         */
        flyToCart(startX, startY, endX, endY, image) {
            return new Promise((resolve) => {
                this.setData({
                    flyToCart: true,
                    flyX: startX,
                    flyY: startY,
                    flyImage: image
                });

                // 用 WXML animation API 做抛物线
                const animation = wx.createAnimation({
                    duration: 500,
                    timingFunction: 'ease-in'
                });

                // 阶段1：先上抛
                animation.translateY(-80).scale(0.8).step({ duration: 200 });
                // 阶段2：落向购物袋
                animation.translate(endX - startX, endY - startY).scale(0.2).opacity(0.3).step({ duration: 300 });

                this.setData({ flyAnimation: animation.export() });

                setTimeout(() => {
                    this.setData({ flyToCart: false });
                    // 触发购物袋 badge 弹跳
                    this.showCartBounce(1);
                    resolve();
                }, 550);
            });
        },

        // ====== 层级二：复制成功提示 ======
        /**
         * 显示复制成功的轻量提示
         * @param {string} text - 提示文字，默认"已复制"
         */
        showCopySuccess(text) {
            this._setDisplayData({
                showToastCheck: true,
                toastText: text || '已复制'
            });
            setTimeout(() => {
                this._setDisplayData({ showToastCheck: false });
            }, 800);
        },

        // ====== 层级二：卡片滑出 ======
        slideOutCard(callback) {
            this.setData({ slideOut: true, slideOutCard: true });
            setTimeout(() => {
                this.setData({ slideOut: false, slideOutCard: false });
                if (callback) callback();
            }, 300);
        },

        // ====== 层级二：购物袋 badge 弹跳 ======
        /**
         * 购物袋图标上方显示 +N 弹跳效果
         * @param {number} count - 添加的数量
         */
        showCartBounce(count) {
            this._setDisplayData({
                cartBounce: true,
                addCount: count || 1
            });
            setTimeout(() => {
                this._setDisplayData({ cartBounce: false });
            }, 600);
        }
    }
});
