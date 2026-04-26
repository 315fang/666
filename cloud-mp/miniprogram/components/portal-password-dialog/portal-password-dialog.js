Component({
    data: {
        visible: false,
        title: '输入业务密码',
        placeholderText: '请输入6位数字业务密码',
        password: '',
        passwordVisible: false,
        inputFocused: false,
        confirmText: '确认',
        cancelText: '取消'
    },

    lifetimes: {
        detached() {
            const resolver = this._resolver;
            this._resolver = null;
            if (typeof resolver === 'function') {
                resolver('');
            }
        }
    },

    methods: {
        noop() {},

        open(options = {}) {
            if (this._resolver) {
                this.finish('');
            }

            return new Promise((resolve) => {
                this._resolver = resolve;
                this.setData({
                    visible: true,
                    title: options.title || '输入业务密码',
                    placeholderText: options.placeholderText || '请输入6位数字业务密码',
                    confirmText: options.confirmText || '确认',
                    cancelText: options.cancelText || '取消',
                    password: '',
                    passwordVisible: false,
                    inputFocused: false
                });
                setTimeout(() => {
                    if (this.data.visible) {
                        this.setData({ inputFocused: true });
                    }
                }, 80);
            });
        },

        onInput(e) {
            const value = String(e.detail && e.detail.value || '').replace(/\D/g, '').slice(0, 6);
            this.setData({ password: value });
            return value;
        },

        onToggleVisible() {
            this.setData({ passwordVisible: !this.data.passwordVisible });
        },

        onCancel() {
            this.finish('');
        },

        onConfirm() {
            const password = String(this.data.password || '').trim();
            if (!password) {
                wx.showToast({ title: '请输入业务密码', icon: 'none' });
                return;
            }
            this.finish(password);
        },

        finish(password) {
            const resolver = this._resolver;
            this._resolver = null;
            if (this.data && this.data.visible) {
                this.setData({
                    visible: false,
                    password: '',
                    passwordVisible: false,
                    inputFocused: false
                });
            }
            if (typeof resolver === 'function') {
                resolver(password || '');
            }
        }
    }
});
