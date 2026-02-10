// pages/order/logistics.js - 物流跟踪页面
const { get } = require('../../utils/request');

Page({
    data: {
        orderId: '',
        trackingNumber: '',
        courierCompany: '',
        courierPhone: '',
        logisticsStatus: 'shipping', // shipping, delivered, problem
        trackingInfo: [], // 物流轨迹列表
        product: null, // 商品信息
        loading: true,
        error: false,
        errorMessage: ''
    },

    onLoad(options) {
        const { id, tracking_number } = options;
        if (!id) {
            wx.showToast({
                title: '缺少订单信息',
                icon: 'none'
            });
            setTimeout(() => {
                wx.navigateBack();
            }, 1500);
            return;
        }

        this.setData({
            orderId: id,
            trackingNumber: tracking_number || ''
        });

        this.loadLogisticsInfo();
    },

    // 加载物流信息
    async loadLogisticsInfo() {
        try {
            this.setData({ loading: true, error: false });

            // 获取订单详情和物流信息
            const res = await get(`/orders/${this.data.orderId}`);

            if (res.code === 0 && res.data) {
                const order = res.data;

                // 解析商品图片
                let productImage = '';
                if (order.items && order.items.length > 0) {
                    const firstItem = order.items[0];
                    if (typeof firstItem.product_images === 'string') {
                        try {
                            const images = JSON.parse(firstItem.product_images);
                            productImage = Array.isArray(images) && images.length > 0 ? images[0] : '';
                        } catch (e) {
                            productImage = firstItem.product_images || '';
                        }
                    } else if (Array.isArray(firstItem.product_images)) {
                        productImage = firstItem.product_images[0] || '';
                    }
                }

                this.setData({
                    trackingNumber: order.tracking_number || this.data.trackingNumber,
                    courierCompany: order.courier_company || '未知快递',
                    courierPhone: order.courier_phone || '',
                    product: {
                        name: order.items && order.items.length > 0 ? order.items[0].product_name : '订单商品',
                        image: productImage,
                        quantity: order.items && order.items.length > 0 ? order.items[0].quantity : 1
                    }
                });

                // 如果有物流单号，获取物流轨迹
                if (order.tracking_number) {
                    await this.loadTrackingDetails(order.tracking_number, order.courier_company);
                } else {
                    this.setData({
                        loading: false,
                        error: true,
                        errorMessage: '暂无物流信息，商家尚未发货'
                    });
                }
            } else {
                throw new Error(res.message || '获取订单信息失败');
            }
        } catch (err) {
            console.error('加载物流信息失败:', err);
            this.setData({
                loading: false,
                error: true,
                errorMessage: err.message || '获取物流信息失败'
            });
        }
    },

    // 加载物流轨迹详情
    async loadTrackingDetails(trackingNumber, courierCompany) {
        try {
            // 调用物流查询接口
            // 注意：这里需要后端实现物流查询API，可以对接快递100、快递鸟等第三方服务
            const res = await get('/logistics/track', {
                tracking_number: trackingNumber,
                courier_company: courierCompany
            });

            if (res.code === 0 && res.data) {
                // 解析物流轨迹
                const trackingInfo = res.data.traces || res.data.list || [];
                const status = res.data.status || 'shipping';

                this.setData({
                    trackingInfo,
                    logisticsStatus: status,
                    loading: false
                });
            } else {
                // 如果后端接口未实现，显示模拟数据提示
                this.setData({
                    loading: false,
                    trackingInfo: [],
                    errorMessage: '物流轨迹查询接口暂未对接，请联系商家获取物流信息'
                });
            }
        } catch (err) {
            console.error('获取物流轨迹失败:', err);

            // 提供友好的降级体验：显示基本物流信息
            this.setData({
                loading: false,
                trackingInfo: [],
                errorMessage: '暂时无法获取详细物流轨迹，但您的包裹正在配送中'
            });
        }
    },

    // 刷新物流信息
    onRefresh() {
        this.loadLogisticsInfo();
    },

    // 复制物流单号
    copyTrackingNumber() {
        if (!this.data.trackingNumber) {
            wx.showToast({
                title: '暂无物流单号',
                icon: 'none'
            });
            return;
        }

        wx.setClipboardData({
            data: this.data.trackingNumber,
            success: () => {
                wx.showToast({
                    title: '已复制物流单号',
                    icon: 'success'
                });
            }
        });
    },

    // 拨打快递电话
    callCourier() {
        if (!this.data.courierPhone) {
            wx.showToast({
                title: '暂无客服电话',
                icon: 'none'
            });
            return;
        }

        wx.makePhoneCall({
            phoneNumber: this.data.courierPhone
        });
    },

    // 返回订单详情
    backToOrderDetail() {
        wx.navigateBack();
    }
});
