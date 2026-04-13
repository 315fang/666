const app = getApp();
const { get } = require('../../utils/request');

const FAQ_LIST = [
    {
        question: '商品有使用或成分问题，怎么咨询？',
        preview: '建议先联系专属顾问，描述肤质、使用步骤和问题现象。',
        answer: '遇到成分、搭配、使用顺序等问题，建议优先联系专属顾问，尽量一次说明肤质、购买商品、使用步骤和问题现象，能更快获得针对性建议。'
    },
    {
        question: '收到商品后有破损或漏发怎么办？',
        preview: '保留包装和照片，联系专属顾问会更快处理售后。',
        answer: '若存在破损、漏发、错发，请先保留外包装、面单和商品照片，然后联系专属顾问提交信息，便于尽快核实并处理补发或售后。'
    },
    {
        question: '想了解退款或售后流程怎么办？',
        preview: '先说明订单情况和原因，客服会引导后续步骤。',
        answer: '退款或售后问题建议先准备订单信息、问题描述和相关图片，联系专属顾问后会根据实际情况给出处理方式和所需步骤。'
    },
    {
        question: '电话没接通怎么办？',
        preview: '可以稍后重拨，或直接走微信二维码联系。',
        answer: '如果电话暂时未接通，建议避开高峰时段再次拨打；若页面已配置二维码或客服微信，也可以直接转为微信联系，沟通记录会更完整。'
    }
];

function buildQuickChannels({ wechat, qr, product, channel, hours }) {
    const cards = [];
    const phone = product || channel;

    if (wechat) {
        cards.push({
            key: 'wechat',
            title: '客服微信',
            value: wechat,
            hint: '复制后添加专属顾问',
            action: 'copy_wechat',
            actionText: '复制微信号',
            icon: '/assets/icons/message.svg'
        });
    }

    if (phone) {
        cards.push({
            key: 'phone',
            title: '服务热线',
            value: phone,
            hint: hours ? `服务时段 ${hours}` : '工作时间内优先接听',
            action: 'call_phone',
            actionText: '立即拨打',
            icon: '/assets/icons/headphones.svg'
        });
    }

    if (qr) {
        cards.push({
            key: 'qr',
            title: '客服二维码',
            value: '扫码添加顾问',
            hint: '保存后可在微信内识别',
            action: 'preview_qr',
            actionText: '查看二维码',
            image: qr
        });
    }

    return cards;
}

function resolveContactModel({ channel, product, qr, wechat }) {
    if (wechat) {
        return {
            primaryContactLabel: '客服微信',
            primaryContactText: wechat,
            primaryActionText: '复制微信号',
            secondaryActionText: qr ? '查看二维码' : (product || channel ? '电话联系' : ''),
            primaryAction: 'copy_wechat',
            secondaryAction: qr ? 'preview_qr' : 'call_phone'
        };
    }

    if (qr) {
        return {
            primaryContactLabel: '联系渠道',
            primaryContactText: '扫码添加专属顾问',
            primaryActionText: '查看二维码',
            secondaryActionText: product || channel ? '电话联系' : '',
            primaryAction: 'preview_qr',
            secondaryAction: product || channel ? 'call_phone' : ''
        };
    }

    if (product || channel) {
        const phone = product || channel;
        return {
            primaryContactLabel: '服务热线',
            primaryContactText: phone,
            primaryActionText: '立即拨打',
            secondaryActionText: '复制号码',
            primaryAction: 'call_phone',
            secondaryAction: 'copy_phone'
        };
    }

    return {
        primaryContactLabel: '',
        primaryContactText: '',
        primaryActionText: '联系客服',
        secondaryActionText: '',
        primaryAction: '',
        secondaryAction: ''
    };
}

Page({
    data: {
        loaded: false,
        hasAny: false,
        brandName: '问兰',
        customerServiceHours: '9:00-21:00',
        customerServiceWechat: '',
        channel_service_phone: '',
        product_service_phone: '',
        qr_code_url: '',
        faqList: FAQ_LIST,
        quickChannels: [],
        primaryContactLabel: '',
        primaryContactText: '',
        primaryActionText: '联系客服',
        secondaryActionText: '',
        primaryAction: '',
        secondaryAction: ''
    },

    onShow() {
        this.loadChannel();
    },

    loadChannel() {
        get('/mini-program-config', {}, { showError: false, ignore401: true, timeout: 10000 })
            .then((res) => {
                const config = (res && res.code === 0 && res.data) || {};
                const ch = config.customer_service_channel || {};
                const brand = config.brand_config || {};
                const channel = String(ch.channel_service_phone || '').trim();
                const product = String(ch.product_service_phone || '').trim();
                const qr = String(ch.qr_code_url || '').trim();
                const brandName = String(brand.brand_name || app.globalData.brandName || '问兰').trim();
                const customerServiceHours = String(brand.customer_service_hours || app.globalData.customerServiceHours || '9:00-21:00').trim();
                const customerServiceWechat = String(brand.customer_service_wechat || app.globalData.customerServiceWechat || '').trim();
                const hasAny = !!(channel || product || qr || customerServiceWechat);
                const contactModel = resolveContactModel({
                    channel,
                    product,
                    qr,
                    wechat: customerServiceWechat
                });
                const quickChannels = buildQuickChannels({
                    wechat: customerServiceWechat,
                    qr,
                    product,
                    channel,
                    hours: customerServiceHours
                });

                this.setData({
                    loaded: true,
                    hasAny,
                    brandName,
                    customerServiceHours,
                    customerServiceWechat,
                    channel_service_phone: channel,
                    product_service_phone: product,
                    qr_code_url: qr,
                    quickChannels,
                    ...contactModel
                });
            })
            .catch(() => {
                const customerServiceWechat = app.globalData.customerServiceWechat || '';
                const customerServiceHours = app.globalData.customerServiceHours || '9:00-21:00';
                const contactModel = resolveContactModel({
                    channel: '',
                    product: '',
                    qr: '',
                    wechat: customerServiceWechat
                });
                this.setData({
                    loaded: true,
                    hasAny: false,
                    brandName: app.globalData.brandName || '问兰',
                    customerServiceHours,
                    customerServiceWechat,
                    quickChannels: buildQuickChannels({
                        wechat: customerServiceWechat,
                        qr: '',
                        product: '',
                        channel: '',
                        hours: customerServiceHours
                    }),
                    ...contactModel
                });
            });
    },

    _normalizePhone(raw) {
        return String(raw || '').trim().replace(/\s/g, '');
    },

    _call(raw) {
        const phoneNumber = this._normalizePhone(raw);
        if (!phoneNumber) {
            wx.showToast({ title: '号码未配置', icon: 'none' });
            return;
        }
        wx.makePhoneCall({
            phoneNumber,
            fail: () => {
                wx.showToast({ title: '无法发起拨号', icon: 'none' });
            }
        });
    },

    onPrimaryContactTap() {
        this._runAction(this.data.primaryAction);
    },

    onSecondaryContactTap() {
        this._runAction(this.data.secondaryAction);
    },

    onQuickActionTap(e) {
        const action = e.currentTarget.dataset.action;
        this._runAction(action);
    },

    _runAction(action) {
        if (action === 'copy_wechat') {
            this.onCopyWechat();
            return;
        }
        if (action === 'preview_qr') {
            this.onPreviewQr();
            return;
        }
        if (action === 'call_phone') {
            this._call(this.data.product_service_phone || this.data.channel_service_phone);
            return;
        }
        if (action === 'copy_phone') {
            this.onCopyPhone();
        }
    },

    onCopyWechat() {
        const wechat = String(this.data.customerServiceWechat || '').trim();
        if (!wechat) {
            wx.showToast({ title: '微信号未配置', icon: 'none' });
            return;
        }
        wx.setClipboardData({
            data: wechat,
            success: () => {
                wx.showToast({ title: '微信号已复制', icon: 'success' });
            }
        });
    },

    onCopyPhone() {
        const phone = String(this.data.product_service_phone || this.data.channel_service_phone || '').trim();
        if (!phone) {
            wx.showToast({ title: '号码未配置', icon: 'none' });
            return;
        }
        wx.setClipboardData({
            data: phone,
            success: () => {
                wx.showToast({ title: '号码已复制', icon: 'success' });
            }
        });
    },

    onPreviewQr() {
        const url = String(this.data.qr_code_url || '').trim();
        if (!url) {
            wx.showToast({ title: '二维码未配置', icon: 'none' });
            return;
        }
        wx.previewImage({
            current: url,
            urls: [url]
        });
    },

    onFaqTap(e) {
        const index = Number(e.currentTarget.dataset.index);
        const faq = this.data.faqList[index];
        if (!faq) return;
        wx.showModal({
            title: faq.question,
            content: faq.answer,
            showCancel: false,
            confirmText: '知道了'
        });
    }
});
