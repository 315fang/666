/**
 * 轻度说明弹窗：按自然日去重（本地 storage）
 */

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${y}-${pad(m)}-${pad(day)}`;
}

function dailyStorageKey(prefix) {
  return `${prefix}_${todayStr()}`;
}

function shouldShowDaily(prefix) {
  try {
    return !wx.getStorageSync(dailyStorageKey(prefix));
  } catch (_) {
    return true;
  }
}

function markDailyShown(prefix) {
  try {
    wx.setStorageSync(dailyStorageKey(prefix), 1);
  } catch (_) {
    /* ignore */
  }
}

function formatPromptBody(text, vars) {
  if (text == null || text === '') return '';
  let s = String(text);
  const count = vars && vars.count != null ? vars.count : vars && vars.issued != null ? vars.issued : 0;
  s = s.replace(/\{count\}/g, String(count));
  return s;
}

function consumePendingRegisterPrompt() {
  try {
    const app = getApp();
    const p = app && app.globalData && app.globalData.pendingRegisterCouponPrompt;
    if (!p || !p.title) return null;
    app.globalData.pendingRegisterCouponPrompt = null;
    return p;
  } catch (_) {
    return null;
  }
}

module.exports = {
  shouldShowDaily,
  markDailyShown,
  formatPromptBody,
  dailyStorageKey,
  consumePendingRegisterPrompt
};
