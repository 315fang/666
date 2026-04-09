/**
 * requestAuth.js — 云开发版（空实现）
 * 原版用于 JWT token 刷新，云开发无需 token，保留接口签名避免调用方报错。
 */
function createLoginExpiredHandler(ErrorHandler) {
    return function handleLoginExpired() {
        const app = getApp();
        if (app && app.triggerLogin) {
            return app.triggerLogin().catch(() => {});
        }
        return Promise.resolve();
    };
}

module.exports = { createLoginExpiredHandler };
