Page({
    data: {
        loading: true,
        resultDesc: "您的AI选品正在最后生成环节...",
        estimatedValue: "399+",
        payPrice: "199",
        itemsCount: "3-4",
        analysisText: ""
    },

    onLoad() {
        // 模拟等待模型接口返回或异步生成过程 
        setTimeout(() => {
            this.setData({
                loading: false,
                analysisText: "AI 综合您的评测档案：您偏爱冷淡极致的极简设计，喜欢提升生活品质的家用小物件以及高功效的美肤产品，并有轻奢猎奇诉求。我们已在百万级优质货盘中，锁定了一份匹配契合度高达 92% 的生活盲点礼包。里面包含了能瞬间缓解压力的香氛、以及一抹自然的好物。"
            });
        }, 2000);
    },

    payNow() {
        wx.showModal({
            title: '温馨提示',
            content: '该功能即将接入真实支付中心，确定购买并生成盲盒订单吗？',
            success: (res) => {
                if (res.confirm) {
                    wx.showToast({
                        title: '订单创建中...',
                        icon: 'loading'
                    });
                    // FIXME: 请求后端创建订单等操作
                    setTimeout(() => {
                        wx.redirectTo({
                            url: '/pages/order/list'
                        });
                    }, 1500)
                }
            }
        });
    }
});
