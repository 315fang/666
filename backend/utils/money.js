/**
 * 金额精度工具 — 避免 JS 浮点误差
 * 所有金额在存入数据库前应经过 toMoney() 处理
 */

function toMoney(value) {
    return Math.round(parseFloat(value || 0) * 100) / 100;
}

function addMoney(a, b) {
    return toMoney(parseFloat(a || 0) + parseFloat(b || 0));
}

function subMoney(a, b) {
    return toMoney(parseFloat(a || 0) - parseFloat(b || 0));
}

module.exports = { toMoney, addMoney, subMoney };
