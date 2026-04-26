// pages/cart/cart.js
const { get, post, put, del } = require('../../utils/request');
const { parseImages, getFirstImage, formatMoney, processProducts } = require('../../utils/dataFormatter');
const { ErrorHandler, showError, showSuccess } = require('../../utils/errorHandler');
const { markCartChanged, markCartStateSeen } = require('../../utils/cartState');
const app = getApp();

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
        recommendedProducts: [], // 新增：推荐商品
        roleLevel: 0
    },

    onShow() {
        // 获取当前用户角色等级
        const roleLevel = app.globalData.userInfo?.role_level || 0;
        this.setData({ roleLevel });

        // 每次显示页面时刷新购物袋
        this.loadCart();

        // 显示空购物袋动画
        setTimeout(() => {
            this.setData({ showEmpty: true });
        }, 100);
    },

    async loadCart() {
        this.setData({ loading: true, showEmpty: false });
        const { roleLevel } = this.data;

        try {
            const res = await get('/cart');
            // 后端返回 { list: [...], total: n } 或 { items: [...], summary: {...} }
            const items = res.data?.items || res.data?.list || (Array.isArray(res.data) ? res.data : []) || [];
const cartItems = (Array.isArray(items) ? items : []).map((item, index) => {
                // 使用统一工具函数处理商品
                const productData = item.product || {};
                const processed = processProducts([productData], roleLevel)[0] || {};
                const cartId = item.cart_id || item._id || item.id;

                return {
                    ...item,
                    id: cartId,
                    cart_id: cartId,
                    selected: item.selected !== false,
                    // 获取价格：优先用后端按用户等级计算的 effective_price，
                    // 再 fallback 到工具函数计算出的等级价
                    price: parseFloat(item.effective_price || processed.displayPrice || 0),
                    // 使用处理后的商品信息
                    productImages: processed.images,
                    firstImage: item.sku?.image || processed.firstImage,
                    productName: processed.name || '商品',
                    animateIn: true
                };
            });

            this.setData({
                cartItems,
                selectAll: cartItems.length > 0 && cartItems.every(i => i.selected),
                loading: false
            });

            // 如果是空购物袋，加载推荐商品
            if (cartItems.length === 0) {
                this.loadRecommended();
            }

            // 清除入场动画标记
            setTimeout(() => {
                const updatedItems = cartItems.map(item => ({ ...item, animateIn: false }));
                this.setData({ cartItems: updatedItems });
            }, 800);

            this.calculateTotal();
            markCartStateSeen(this);

            // 如果是空购物袋，显示动画
            if (cartItems.length === 0) {
                setTimeout(() => {
                    this.setData({ showEmpty: true });
                }, 100);
            }
        } catch (err) {
            ErrorHandler.handle(err, {
                customMessage: '加载购物袋失败，请稍后重试'
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
            const res = await get('/products', { limit: 6 });
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

    onGoProductDetail(e) {
        const { id } = e.currentTarget.dataset;
        if (id) wx.navigateTo({ url: `/pages/product/detail?id=${id}` });
    },

    onRecommendedTap(e) {
        const { id } = e.currentTarget.dataset;
        if (id) wx.navigateTo({ url: `/pages/product/detail?id=${id}` });
    },


    // 计算总价（整数分运算，避免浮点误差）
    calculateTotal() {
        const { cartItems } = this.data;
        let totalPriceFen = 0;
        let totalCount = 0;

        cartItems.forEach(item => {
            if (item.selected) {
                totalPriceFen += Math.round(item.price * 100) * item.quantity;
                totalCount += item.quantity;
            }
        });

        const allSelected = cartItems.length > 0 && cartItems.every(item => item.selected);

        this.setData({
            totalPrice: formatMoney(totalPriceFen / 100),
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

    // 全选/取消全选（用路径更新替代全量 map，避免整个数组传输）
    onToggleSelectAll() {
        const newSelectAll = !this.data.selectAll;
        const updates = {};
        this.data.cartItems.forEach((_, i) => {
            updates[`cartItems[${i}].selected`] = newSelectAll;
        });
        updates.selectAll = newSelectAll;
        updates.priceAnim = true;
        updates.countAnim = true;
        this.setData(updates);
        setTimeout(() => { this.setData({ priceAnim: false, countAnim: false }); }, 400);
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

        const stockLimit = Number(item.sku?.stock ?? item.product?.stock ?? 0);
        if (type === 'plus' && stockLimit > 0 && newQuantity > stockLimit) {
            wx.showToast({ title: '库存不足', icon: 'none' });
            return;
        }

        if (newQuantity === item.quantity) return;

        // 乐观更新：先改 UI，请求失败再回滚
        const oldQuantity = item.quantity;
        this.setData({ [`cartItems[${index}].quantity`]: newQuantity });
        this.calculateTotal();

        try {
            await put(`/cart/${item.id}`, { qty: newQuantity, quantity: newQuantity });
            markCartChanged('cart_quantity');

            // 触发动画
            const animKey = `cartItems[${index}].quantityAnim`;
            this.setData({ [animKey]: true });
            setTimeout(() => { this.setData({ [animKey]: false }); }, 300);

            this.setData({ priceAnim: true, countAnim: true });
            setTimeout(() => { this.setData({ priceAnim: false, countAnim: false }); }, 400);
        } catch (err) {
            // 请求失败：回滚数量和总价
            this.setData({ [`cartItems[${index}].quantity`]: oldQuantity });
            this.calculateTotal();
            wx.showToast({ title: '更新数量失败，请重试', icon: 'none' });
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
                        markCartChanged('cart_remove');

                        // 请求成功后再触发删除动画
                        const deleteKey = `cartItems[${index}].deleting`;
                        this.setData({ [deleteKey]: true });

                        setTimeout(() => {
                            const cartItems = [...this.data.cartItems];
                            cartItems.splice(index, 1);
                            this.setData({ cartItems });
                            this.calculateTotal();

                            if (cartItems.length === 0) {
                                setTimeout(() => { this.setData({ showEmpty: true }); }, 100);
                            }
                        }, 400);
                    } catch (err) {
                        wx.showToast({ title: '删除失败，请重试', icon: 'none' });
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
        const ids = selectedItems
            .map(item => item.cart_id || item._id || item.id)
            .filter(Boolean)
            .map(id => String(id).trim())
            .filter(Boolean);
        if (ids.length === 0) {
            wx.showToast({ title: '购物袋商品已失效，请刷新后重试', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: `/pages/order/confirm?cart_ids=${encodeURIComponent(ids.join(','))}` });
    }
});
