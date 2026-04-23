/**
 * requestAuth.js — 云开发版（空实现）
 * 原版用于 JWT token 刷新，当前仅保留登录失效处理入口，统一转到 app 级登录流程。
 */
const { triggerLogin } = require('./auth');

function createLoginExpiredHandler(ErrorHandler) {
    return function handleLoginExpired() {
        const app = typeof getApp === 'function' ? getApp() : null;
        return Promise.resolve()
            .then(() => {
                if (app && typeof app.logout === 'function') {
                    app.logout();
                }
            })
            .then(() => triggerLogin())
            .catch(() => {});
    };
}

module.exports = { createLoginExpiredHandler };
