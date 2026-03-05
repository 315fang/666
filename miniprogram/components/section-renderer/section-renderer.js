/**
 * section-renderer 动态区块渲染引擎
 * 根据后端下发的 section_type 动态渲染对应组件
 *
 * 使用方法（在 WXML 中）：
 *   <section-renderer wx:for="{{sections}}" wx:key="id" section="{{item}}" wx:if="{{item.is_visible}}"/>
 */
const { get } = require('../../utils/request');

Component({
    properties: {
        // 后端下发的单个 section 数据
        section: {
            type: Object,
            value: {}
        }
    },

    data: {
        // product-grid 的商品数据（按需加载）
        products: [],
        // countdown 倒计时显示值
        countdown: { hours: '00', minutes: '00', seconds: '00' },
        _countdownTimer: null
    },

    lifetimes: {
        attached() {
            const type = this.properties.section.section_type;
            if (type === 'product-grid') {
                this._loadProducts();
            }
            if (type === 'countdown') {
                this._startCountdown();
            }
        },
        detached() {
            // 清理倒计时
            if (this.data._countdownTimer) {
                clearInterval(this.data._countdownTimer);
            }
        }
    },

    methods: {
        // ——— product-grid：按 categoryId + limit 拉取商品 ———
        async _loadProducts() {
            const cfg = this.properties.section.config || {};
            const { categoryId = '', limit = 6 } = cfg;
            try {
                const params = { page: 1, limit, status: 1 };
                if (categoryId) params.category_id = categoryId;
                const res = await get('/products', params);
                this.setData({ products: (res.data && res.data.list) || [] });
            } catch (e) {
                console.warn('[SectionRenderer] product-grid 加载失败', e);
            }
        },

        // ——— countdown：秒级倒计时 ———
        _startCountdown() {
            const cfg = this.properties.section.config || {};
            if (!cfg.endTime) return;
            const endMs = new Date(cfg.endTime).getTime();

            const update = () => {
                const diff = endMs - Date.now();
                if (diff <= 0) {
                    clearInterval(timer);
                    this.setData({ countdown: { hours: '00', minutes: '00', seconds: '00' } });
                    return;
                }
                const hours = String(Math.floor(diff / 3600000)).padStart(2, '0');
                const minutes = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
                const seconds = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
                this.setData({ countdown: { hours, minutes, seconds } });
            };

            update();
            const timer = setInterval(update, 1000);
            this.setData({ _countdownTimer: timer });
        },

        // ——— 区块内点击事件上报给父页面 ———
        onSectionTap(e) {
            this.triggerEvent('sectiontap', {
                section: this.properties.section,
                item: e.currentTarget.dataset
            });
        }
    }
});
