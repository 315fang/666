// pages/order/refund-detail.js - 退款详情
const { get, put } = require('../../utils/request');
const { parseImages } = require('../../utils/dataFormatter');
const { resolveCloudImageList } = require('./utils/cloudAsset');
const { normalizeRefundConsumer } = require('./orderConsumerFields');

Page({
    data: {
        refund: null,
        loading: true,
        submittingReturnShipping: false,
        returnShippingForm: {
            return_company: '',
            return_tracking_no: ''
        },
        statusText: {
            pending: '审核中',
            approved: '审核通过，等待退款',
            rejected: '申请被拒绝',
            processing: '退款处理中',
            completed: '退款完成',
            cancelled: '已取消'
        },
        typeText: {
            refund_only: '仅退款',
            return_refund: '退货退款',
            exchange: '换货'
        },
        reasonText: {
            quality: '商品质量问题',
            wrong_item: '商品与描述不符',
            not_needed: '不想要了/买多了',
            damaged: '商品破损/缺件',
            other: '其他原因'
        }
    },

    onLoad(options) {
        if (options.id) {
            this.loadRefund(options.id);
        } else {
            this.setData({ loading: false });
            wx.showToast({ title: '参数缺失', icon: 'none' });
            setTimeout(() => wx.navigateBack(), 1500);
        }
    },

    async loadRefund(id) {
        try {
            const res = await get(`/refunds/${id}`);
            if (res.code === 0 && res.data) {
                const refund = normalizeRefundConsumer(res.data);
                if (refund.order && refund.order.product && refund.order.product.images) {
                    refund.order.product.images = await resolveCloudImageList(
                        refund.order.product.images,
                        parseImages(refund.order.product.images)
                    );
                }
                this.setData({
                    refund,
                    loading: false,
                    returnShippingForm: {
                        return_company: refund.return_company || '',
                        return_tracking_no: refund.return_tracking_no || ''
                    }
                });
            } else {
                this.setData({ loading: false });
                wx.showToast({ title: res.message || '加载失败', icon: 'none' });
            }
        } catch (err) {
            this.setData({ loading: false });
            wx.showToast({ title: '加载失败', icon: 'none' });
        }
    },

    onInputReturnCompany(e) {
        this.setData({
            'returnShippingForm.return_company': e.detail.value
        });
    },

    onInputReturnTrackingNo(e) {
        this.setData({
            'returnShippingForm.return_tracking_no': e.detail.value
        });
    },

    async onSubmitReturnShipping() {
        const { refund, returnShippingForm, submittingReturnShipping } = this.data;
        if (!refund || submittingReturnShipping) return;

        const trackingNo = String(returnShippingForm.return_tracking_no || '').trim();
        const company = String(returnShippingForm.return_company || '').trim();
        if (!trackingNo) {
            wx.showToast({ title: '请填写退货物流单号', icon: 'none' });
            return;
        }

        this.setData({ submittingReturnShipping: true });
        try {
            const res = await put(`/refunds/${refund.id}/return-shipping`, {
                return_tracking_no: trackingNo,
                return_company: company || undefined
            });
            const updatedRefund = normalizeRefundConsumer({
                ...refund,
                ...(res.data || res),
                return_tracking_no: trackingNo,
                return_company: company
            });
            this.setData({
                refund: updatedRefund,
                'returnShippingForm.return_tracking_no': trackingNo,
                'returnShippingForm.return_company': company
            });
            wx.showToast({ title: '提交成功', icon: 'success' });
        } catch (err) {
            wx.showToast({ title: err.message || '提交失败', icon: 'none' });
        } finally {
            this.setData({ submittingReturnShipping: false });
        }
    }
});
