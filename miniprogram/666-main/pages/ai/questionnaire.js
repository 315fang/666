const app = getApp();

Page({
    data: {
        currentStep: 0,
        questions: [],
        answers: {},
        isSubmitting: false,
        agreed: false
    },

    onLoad() {
        this.fetchQuestions();
    },

    fetchQuestions() {
        wx.request({
            url: `${app.globalData.apiBaseUrl}/api/user/preferences/questions`,
            header: { 'Authorization': 'Bearer ' + wx.getStorageSync('token') },
            success: (res) => {
                if (res.data.code === 0) {
                    this.setData({ questions: res.data.data });
                } else {
                    wx.showToast({ title: '获取题目失败', icon: 'none' });
                }
            },
            fail: () => {
                wx.showToast({ title: '网络异常', icon: 'none' });
            }
        });
    },

    selectOption(e) {
        const { questionId, optionValue } = e.currentTarget.dataset;
        const { answers, currentStep, questions } = this.data;

        // 记录答案
        answers[questionId] = optionValue;
        this.setData({ answers });

        // 自动跳下一题或结束
        setTimeout(() => {
            if (currentStep < questions.length - 1) {
                this.setData({ currentStep: currentStep + 1 });
            } else {
                // 到达最后一题，等待用户点击提交
            }
        }, 300);
    },

    toggleAgreement() {
        this.setData({ agreed: !this.data.agreed });
    },

    viewAgreement() {
        wx.navigateTo({
            url: '/pages/agreement/ai-blindbox'
        });
    },

    submitPreferences() {
        if (!this.data.agreed) {
            wx.showToast({ title: '请先阅读并同意协议', icon: 'none' });
            return;
        }

        const { answers, questions } = this.data;
        if (Object.keys(answers).length < questions.length) {
            wx.showToast({ title: '请回答完所有问题', icon: 'none' });
            return;
        }

        this.setData({ isSubmitting: true });

        wx.request({
            url: `${app.globalData.apiBaseUrl}/api/user/preferences/submit`,
            method: 'POST',
            header: { 'Authorization': 'Bearer ' + wx.getStorageSync('token') },
            data: { preferences: answers },
            success: (res) => {
                if (res.data.code === 0) {
                    wx.showToast({ title: 'AI 分析完成！', icon: 'success' });
                    setTimeout(() => {
                        wx.navigateTo({ url: '/pages/ai/blindbox-result' });
                    }, 1500);
                } else {
                    wx.showToast({ title: res.data.message || '提交失败', icon: 'none' });
                    this.setData({ isSubmitting: false });
                }
            },
            fail: () => {
                wx.showToast({ title: '网络异常', icon: 'none' });
                this.setData({ isSubmitting: false });
            }
        });
    }
});
