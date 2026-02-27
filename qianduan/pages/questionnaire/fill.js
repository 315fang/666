// pages/questionnaire/fill.js - 邀请问卷填写页
const app = getApp();
const { get, post } = require('../../utils/request');

Page({
    data: {
        inviterId: null,
        inviterInfo: null,
        questionnaire: null,
        answers: {},
        loading: true,
        submitting: false,
        submitted: false,
        submitResult: null,
        // 地区选择器（按字段 key 存储，避免多个 region 字段冲突）
        regionValues: {},
        // 隐私协议
        agreedPrivacy: false
    },

    onLoad(options) {
        const inviterId = options.inviter_id;
        if (!inviterId) {
            wx.showToast({ title: '无效的邀请链接', icon: 'none' });
            setTimeout(() => {
                wx.switchTab({ url: '/pages/index/index' });
            }, 1500);
            return;
        }
        this.setData({ inviterId });

        // 确保用户已登录
        this.ensureLogin().then(() => {
            this.loadData();
        });
    },

    async ensureLogin() {
        if (!app.globalData.isLoggedIn) {
            try {
                await app.wxLogin(false);
            } catch (err) {
                console.error('静默登录失败:', err);
            }
        }
    },

    async loadData() {
        this.setData({ loading: true });
        try {
            // 并行加载问卷模板和邀请人信息
            const [qRes] = await Promise.all([
                get('/questionnaire/active')
            ]);

            if (qRes.code !== 0 || !qRes.data) {
                wx.showToast({ title: '问卷暂不可用', icon: 'none' });
                this.setData({ loading: false });
                return;
            }

            this.setData({
                questionnaire: qRes.data,
                loading: false
            });
        } catch (err) {
            console.error('加载问卷失败:', err);
            wx.showToast({ title: '加载失败', icon: 'none' });
            this.setData({ loading: false });
        }
    },

    // 文本输入
    onInput(e) {
        const key = e.currentTarget.dataset.key;
        const value = e.detail.value;
        this.setData({
            [`answers.${key}`]: value
        });
    },

    // 单选
    onRadioChange(e) {
        const key = e.currentTarget.dataset.key;
        const value = e.detail.value;
        this.setData({
            [`answers.${key}`]: value
        });
    },

    // 多选
    onCheckboxChange(e) {
        const key = e.currentTarget.dataset.key;
        const value = e.detail.value; // array
        this.setData({
            [`answers.${key}`]: value
        });
    },

    // 地区选择
    onRegionChange(e) {
        const key = e.currentTarget.dataset.key;
        const value = e.detail.value; // ['省', '市', '区']
        this.setData({
            [`answers.${key}`]: value.join(' '),
            [`regionValues.${key}`]: value
        });
    },

    // 下拉选择（picker 返回的是 index，需要转为选项文本）
    onSelectChange(e) {
        const key = e.currentTarget.dataset.key;
        const index = e.detail.value; // picker 返回的是索引
        const field = this.data.questionnaire.fields.find(f => f.key === key);
        if (field && field.options && field.options[index]) {
            this.setData({
                [`answers.${key}`]: field.options[index]
            });
        }
    },

    // 隐私协议勾选
    onPrivacyChange() {
        this.setData({ agreedPrivacy: !this.data.agreedPrivacy });
    },

    // 提交问卷
    async onSubmit() {
        if (this.data.submitting || this.data.submitted) return;

        // 隐私协议检查
        if (!this.data.agreedPrivacy) {
            wx.showToast({ title: '请先同意隐私协议', icon: 'none' });
            return;
        }

        const { questionnaire, answers, inviterId } = this.data;
        if (!questionnaire) return;

        // 确保已登录
        if (!app.globalData.isLoggedIn) {
            try {
                await app.wxLogin(true);
            } catch (err) {
                wx.showToast({ title: '请先登录', icon: 'none' });
                return;
            }
        }

        // 前端验证必填项
        for (const field of questionnaire.fields) {
            if (field.required) {
                const val = answers[field.key];
                if (!val || (typeof val === 'string' && !val.trim())) {
                    wx.showToast({ title: `请填写${field.label}`, icon: 'none' });
                    return;
                }
                // 手机号格式验证
                if (field.type === 'phone' && !/^1[3-9]\d{9}$/.test(val)) {
                    wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
                    return;
                }
            }
        }

        this.setData({ submitting: true });

        try {
            const res = await post('/questionnaire/submit', {
                questionnaire_id: questionnaire.id,
                inviter_id: parseInt(inviterId),
                answers
            });

            if (res.code === 0) {
                this.setData({
                    submitted: true,
                    submitResult: res.data,
                    submitting: false
                });

                // ★ 触发「加入团队」品牌动画
                if (this.brandAnimation) {
                    const inviterName = this.data.inviterInfo
                        ? (this.data.inviterInfo.nickname || '臻选大家庭')
                        : '臻选大家庭';
                    this.brandAnimation.show('joinTeam', { teamName: inviterName });
                }
            } else {
                wx.showToast({ title: res.message || '提交失败', icon: 'none' });
                this.setData({ submitting: false });
            }
        } catch (err) {
            wx.showToast({ title: err.message || '提交失败', icon: 'none' });
            this.setData({ submitting: false });
        }
    },

    onReady() {
        this.brandAnimation = this.selectComponent('#brandAnimation');
    },

    // 提交成功后回到首页
    goHome() {
        wx.switchTab({ url: '/pages/index/index' });
    },

    // 查看我的团队
    goTeam() {
        wx.navigateTo({ url: '/pages/distribution/center' });
    }
});
