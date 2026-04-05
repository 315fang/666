// pages/cart/cart.js
const { get, post, put, del } = require('../../utils/request');
const { parseImages, getFirstImage, formatMoney } = require('../../utils/dataFormatter');
const { ErrorHandler, showError, showSuccess } = require('../../utils/errorHandler');

Page({
    data: {
        cartItems: [],
        selectAll: false,
        totalPrice: 0,
        totalCount: 0,
        loading: true,
        showEmpty: false,
        priceAnim: false,
        countAnim: false,
        recommendedProducts: [] // 新增：推荐商品
    },

    onShow() {
        // 每次显示页面时刷新购物车
        this.loadCart();

        // 显示空购物车动画
        setTimeout(() => {
            this.setData({ showEmpty: true });
        }, 100);
    },

    async loadCart() {
        this.setData({ loading: true, showEmpty: false });

        try {
            const res = await get('/cart');
            // 后端返回 { items: [...], summary: {...} }
            const items = res.data?.items || res.data || [];
            const cartItems = (Array.isArray(items) ? items : []).map((item, index) => {
                // 使用工具函数处理图片
                const productImages = parseImages(item.product?.images);
                const skuImage = item.sku?.image || null;
                const firstImage = skuImage || getFirstImage(item.product?.images);

                return {
                    ...item,
                    selected: item.selected !== false,
                    // 获取价格：优先用后端按用户等级计算的 effective_price，
                    // 再 fallback 到 SKU 零售价，最后是商品零售价
                    // ★ 与 confirm.js 保持一致，避免用户看到的价格和结算价不同
                    price: parseFloat(item.effective_price || item.sku?.retail_price || item.product?.retail_price || 0),
                    // 解析后的图片数组
                    productImages,
                    // 第一张图片（用于显示）
                    firstImage,
                    // 商品名称
                    productName: item.product?.name || '商品',
                    // 入场动画标记
                    animateIn: true
                };
            });

            this.setData({
                cartItems,
                selectAll: cartItems.length > 0 && cartItems.every(i => i.selected),
                loading: false
            });

            // 如果是空购物车，加载推荐商品
            if (cartItems.length === 0) {
                this.loadRecommended();
            }

            // 清除入场动画标记
            setTimeout(() => {
                const updatedItems = cartItems.map(item => ({ ...item, animateIn: false }));
                this.setData({ cartItems: updatedItems });
            }, 800);

            this.calculateTotal();

            // 如果是空购物车，显示动画
            if (cartItems.length === 0) {
                setTimeout(() => {
                    this.setData({ showEmpty: true });
                }, 100);
            }
        } catch (err) {
            ErrorHandler.handle(err, {
                customMessage: '加载购物车失败，请稍后重试'
            });
            this.setData({ loading: false, cartItems: [] });
            this.loadRecommended();
            setTimeout(() => {
                this.setData({ showEmpty: true });
            }, 100);
        }
    },

    // 加载推荐商品
    async loadRecommended() {
        try {
            const res = await get('/products', { limit: 6, sort: 'sales_desc' });
            if (res.code === 0 && res.data) {
                const products = (res.data.list || res.data || []).map(p => ({
                    ...p,
                    firstImage: getFirstImage(p.images)
                }));
                this.setData({ recommendedProducts: products });
            }
        } catch (err) {
            console.error('加载推荐商品失败:', err);
        }
    },

    // 推荐商品跳转
    onRecommendedTap(e) {
        const { id } = e.currentTarget.dataset;
        wx.navigateTo({
            url: `/pages/product/detail?id=${id}`
        });
    },


    // 计算总价
    calculateTotal() {
        const { cartItems } = this.data;
        let totalPrice = 0;
        let totalCount = 0;

        cartItems.forEach(item => {
            if (item.selected) {
                totalPrice += item.price * item.quantity;
                totalCount += item.quantity;
            }
        });

        const allSelected = cartItems.length > 0 && cartItems.every(item => item.selected);

        this.setData({
            totalPrice: formatMoney(totalPrice),
            totalCount,
            selectAll: allSelected
        });
    },

    // 切换单个商品选中状态
    onToggleSelect(e) {
        const index = e.currentTarget.dataset.index;
        const key = `cartItems[${index}].selected`;

        this.setData({
            [key]: !this.data.cartItems[index].selected
        });

        // 触发价格和数量动画
        this.setData({ priceAnim: true, countAnim: true });
        setTimeout(() => {
            this.setData({ priceAnim: false, countAnim: false });
        }, 400);

        this.calculateTotal();
    },

    // 全选/取消全选
    onToggleSelectAll() {
        const newSelectAll = !this.data.selectAll;
        const cartItems = this.data.cartItems.map(item => ({
            ...item,
            selected: newSelectAll
        }));

        this.setData({ cartItems, selectAll: newSelectAll });

        // 触发价格和数量动画
        this.setData({ priceAnim: true, countAnim: true });
        setTimeout(() => {
            this.setData({ priceAnim: false, countAnim: false });
        }, 400);

        this.calculateTotal();
    },

    // 修改数量
    async onQuantityChange(e) {
        const { index, type } = e.currentTarget.dataset;
        const item = this.data.cartItems[index];
        let newQuantity = item.quantity;

        if (type === 'minus') {
            newQuantity = Math.max(1, newQuantity - 1);
        } else {
            newQuantity += 1;
        }

        if (newQuantity === item.quantity) return;

        try {
            await put(`/cart/${item.id}`, { quantity: newQuantity });

            // 触发动画
            const animKey = `cartItems[${index}].quantityAnim`;
            this.setData({
                [animKey]: true,
                [`cartItems[${index}].quantity`]: newQuantity
            });

            // 清除动画标记
            setTimeout(() => {
                this.setData({ [animKey]: false });
            }, 300);

            // 触发价格和数量动画
            this.setData({ priceAnim: true, countAnim: true });
            setTimeout(() => {
                this.setData({ priceAnim: false, countAnim: false });
            }, 400);

            this.calculateTotal();
        } catch (err) {
            console.error('更新数量失败:', err);
        }
    },

    // 删除商品
    async onDelete(e) {
        const index = e.currentTarget.dataset.index;
        const item = this.data.cartItems[index];

        wx.showModal({
            title: '确认删除',
            content: '确定要删除这个商品吗？',
            success: async (res) => {
                if (res.confirm) {
                    try {
                        // 先触发动画
                        const deleteKey = `cartItems[${index}].deleting`;
                        this.setData({ [deleteKey]: true });

                        await del(`/cart/${item.id}`);

                        // 等待动画完成后再删除数据
                        setTimeout(() => {
                            const cartItems = [...this.data.cartItems];
                            cartItems.splice(index, 1);
                            this.setData({ cartItems });
                            this.calculateTotal();

                            // 如果是空购物车了，显示空状态动画
                            if (cartItems.length === 0) {
                                setTimeout(() => {
                                    this.setData({ showEmpty: true });
                                }, 100);
                            }
                        }, 400);
                    } catch (err) {
                        console.error('删除失败:', err);
                    }
                }
            }
        });
    },

    // 去结算
    onCheckout() {
        const selectedItems = this.data.cartItems.filter(item => item.selected);

        if (selectedItems.length === 0) {
            wx.showToast({ title: '请选择商品', icon: 'none' });
            return;
        }

        // 将选中的商品 ID 传递给订单确认页
        const ids = selectedItems.map(item => item.id).join(',');
        wx.navigateTo({ url: `/pages/order/confirm?cart_ids=${ids}` });
    },

    // 商品点击
    onProductTap(e) {
        const item = e.currentTarget.dataset.item;
        wx.navigateTo({ url: `/pages/product/detail?id=${item.product_id}` });
    }
});
