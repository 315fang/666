// pages/distribution/restock.js - 代理商采购入仓
const { get, post } = require('../../utils/request');

Page({
    data: {
        currentStock: 0,
        products: [],
        selectedProduct: null,
        quantity: 10,
        totalAmount: '0.00'
    },

    onShow() {
        this.loadStock();
        this.loadProducts();
    },

    // 获取当前库存
    async loadStock() {
        try {
            const res = await get('/agent/workbench');
            if (res.code === 0) {
                this.setData({ currentStock: res.data.stock_count || 0 });
            }
        } catch (err) {
            console.error('获取库存失败:', err);
        }
    },

    // 加载可进货的商品
    async loadProducts() {
        try {
            const res = await get('/products', { page: 1, limit: 100 });
            if (res.code === 0) {
                const list = (res.data.list || res.data || []).map(item => {
                    let images = item.images;
                    if (typeof images === 'string') {
                        try { images = JSON.parse(images); } catch (e) { images = []; }
                    }
                    return {
                        id: item.id,
                        name: item.name,
                        image: (images && images[0]) || '',
                        retail_price: parseFloat(item.retail_price || 0).toFixed(2),
                        agent_price: parseFloat(item.price_agent || item.price_leader || item.price_member || item.retail_price || 0).toFixed(2),
                        stock: item.stock || 0
                    };
                }).filter(item => item.stock > 0);

                this.setData({ products: list });
            }
        } catch (err) {
            console.error('加载商品失败:', err);
        }
    },

    // 选择商品
    onSelectProduct(e) {
        const product = e.currentTarget.dataset.product;
        this.setData({ selectedProduct: product });
        this.calcTotal();
    },

    // 数量输入
    onQuantityInput(e) {
        let qty = parseInt(e.detail.value) || 1;
        if (qty < 1) qty = 1;
        this.setData({ quantity: qty });
        this.calcTotal();
    },

    onMinus() {
        if (this.data.quantity > 1) {
            this.setData({ quantity: this.data.quantity - 1 });
            this.calcTotal();
        }
    },

    onPlus() {
        const max = this.data.selectedProduct ? this.data.selectedProduct.stock : 9999;
        if (this.data.quantity < max) {
            this.setData({ quantity: this.data.quantity + 1 });
            this.calcTotal();
        }
    },

    // 快捷数量
    onQuickQty(e) {
        const qty = parseInt(e.currentTarget.dataset.qty);
        this.setData({ quantity: qty });
        this.calcTotal();
    },

    // 计算总额
    calcTotal() {
        const { selectedProduct, quantity } = this.data;
        if (!selectedProduct) return;
        const total = (parseFloat(selectedProduct.agent_price) * quantity).toFixed(2);
        this.setData({ totalAmount: total });
    },

    // 确认采购
    async onConfirmRestock() {
        const { selectedProduct, quantity } = this.data;
        if (!selectedProduct) {
            wx.showToast({ title: '请选择商品', icon: 'none' });
            return;
        }
        if (quantity < 1) {
            wx.showToast({ title: '请输入数量', icon: 'none' });
            return;
        }

        const confirmRes = await new Promise(resolve => {
            wx.showModal({
                title: '确认采购',
                content: `${selectedProduct.name}\n数量: ${quantity}件\n总额: ¥${this.data.totalAmount}\n\n采购后库存将直接入仓`,
                confirmText: '确认支付',
                success: resolve
            });
        });

        if (!confirmRes.confirm) return;

        wx.showLoading({ title: '处理中...' });
        try {
            const res = await post('/agent/restock', {
                product_id: selectedProduct.id,
                quantity
            });
            wx.hideLoading();

            if (res.code === 0) {
                wx.showToast({ title: '入仓成功！', icon: 'success' });
                this.setData({
                    currentStock: res.data.stock_after || (this.data.currentStock + quantity)
                });
                this.loadStock();
                this.loadProducts();
            } else {
                wx.showToast({ title: res.message || '采购失败', icon: 'none' });
            }
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: err.message || '采购失败', icon: 'none' });
        }
    }
});
