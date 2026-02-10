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
        loading: true
    },

    onShow() {
        // 每次显示页面时刷新购物车
        this.loadCart();
    },

    async loadCart() {
        this.setData({ loading: true });

        try {
            const res = await get('/cart');
            // 后端返回 { items: [...], summary: {...} }
            const items = res.data?.items || res.data || [];
            const cartItems = (Array.isArray(items) ? items : []).map(item => {
                // 使用工具函数处理图片
                const productImages = parseImages(item.product?.images);
                const skuImage = item.sku?.image || null;
                const firstImage = skuImage || getFirstImage(item.product?.images);

                return {
                    ...item,
                    selected: item.selected !== false,
                    // 获取价格：优先 SKU 价格，其次商品价格
                    price: parseFloat(item.sku?.retail_price || item.product?.retail_price || 0),
                    // 解析后的图片数组
                    productImages,
                    // 第一张图片（用于显示）
                    firstImage,
                    // 商品名称
                    productName: item.product?.name || '商品'
                };
            });

            this.setData({
                cartItems,
                selectAll: cartItems.length > 0 && cartItems.every(i => i.selected),
                loading: false
            });

            this.calculateTotal();
        } catch (err) {
            ErrorHandler.handle(err, {
                customMessage: '加载购物车失败，请稍后重试'
            });
            this.setData({ loading: false, cartItems: [] });
        }
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

            const key = `cartItems[${index}].quantity`;
            this.setData({ [key]: newQuantity });
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
                        await del(`/cart/${item.id}`);

                        const cartItems = [...this.data.cartItems];
                        cartItems.splice(index, 1);
                        this.setData({ cartItems });
                        this.calculateTotal();
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
