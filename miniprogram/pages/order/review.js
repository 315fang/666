// pages/order/review.js - 订单评价页
const { get, post, uploadFile } = require('../../utils/request');
const { parseImages } = require('../../utils/dataFormatter');

Page({
    data: {
        orderId: null,
        productId: null,
        order: null,
        loading: true,
        rating: 5,
        content: '',
        images: [],
        submitting: false,
        starList: [1, 2, 3, 4, 5],
        ratingLabels: ['', '非常差', '较差', '一般', '满意', '非常满意']
    },

    onLoad(options) {
        this.setData({
            orderId: options.order_id,
            productId: options.product_id
        });
        if (options.order_id) {
            this.loadOrder(options.order_id);
        } else {
            this.setData({ loading: false });
        }
    },

    async loadOrder(id) {
        try {
            const res = await get(`/orders/${id}`);
            if (res.code === 0 && res.data) {
                const order = res.data;
                if (order.product) {
                    order.product.images = parseImages(order.product.images);
                }
                this.setData({ order, loading: false });
            } else {
                this.setData({ loading: false });
                wx.showToast({ title: res.message || '加载失败', icon: 'none' });
            }
        } catch (err) {
            this.setData({ loading: false });
            wx.showToast({ title: '加载订单失败', icon: 'none' });
            console.error('加载订单失败:', err);
        }
    },

    // 点击星星评分
    onStarTap(e) {
        const rating = e.currentTarget.dataset.rating;
        this.setData({ rating: parseInt(rating) });
    },

    // 输入评价内容
    onContentInput(e) {
        this.setData({ content: e.detail.value });
    },

    // 选择图片
    async onChooseImage() {
        const { images } = this.data;
        if (images.length >= 9) {
            wx.showToast({ title: '最多上传9张图片', icon: 'none' });
            return;
        }
        wx.chooseMedia({
            count: 9 - images.length,
            mediaType: ['image'],
            sourceType: ['album', 'camera'],
            success: (res) => {
                const newImages = res.tempFiles.map(f => f.tempFilePath);
                this.setData({ images: [...images, ...newImages] });
            }
        });
    },

    // 删除图片
    onDeleteImage(e) {
        const index = e.currentTarget.dataset.index;
        const images = [...this.data.images];
        images.splice(index, 1);
        this.setData({ images });
    },

    // 上传图片到服务器
    async uploadImages() {
        const { images } = this.data;
        const uploaded = [];
        for (const localPath of images) {
            if (localPath.startsWith('http')) {
                uploaded.push(localPath);
                continue;
            }
            try {
                const res = await uploadFile('/user/upload', localPath, 'file', {}, { showLoading: false });
                const url = res?.url || res?.data?.url || res?.data;
                if (url) uploaded.push(url);
            } catch (e) {
                console.error('图片上传失败:', e);
            }
        }
        return uploaded;
    },

    // 提交评价
    async onSubmit() {
        const { orderId, rating, content, images, submitting } = this.data;
        if (submitting) return;

        if (!content.trim() || content.trim().length < 5) {
            wx.showToast({ title: '请至少写5个字的评价', icon: 'none' });
            return;
        }

        this.setData({ submitting: true });
        wx.showLoading({ title: '提交中...' });

        try {
            // 先上传图片
            let uploadedImages = [];
            if (images.length > 0) {
                uploadedImages = await this.uploadImages();
            }

            const res = await post(`/orders/${orderId}/review`, {
                rating,
                content: content.trim(),
                images: uploadedImages
            });

            if (res.code === 0) {
                wx.hideLoading();
                wx.showToast({ title: '评价成功', icon: 'success' });
                setTimeout(() => {
                    wx.navigateBack();
                }, 1500);
            } else {
                wx.hideLoading();
                wx.showToast({ title: res.message || '提交失败', icon: 'none' });
            }
        } catch (err) {
            wx.hideLoading();
            wx.showToast({ title: '提交失败，请重试', icon: 'none' });
            console.error('提交评价失败:', err);
        } finally {
            this.setData({ submitting: false });
        }
    }
});
