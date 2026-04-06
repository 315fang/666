/**
 * 震动管理器
 * 管理各种震动效果
 * 使用单例模式
 */

class VibrateManager {
  constructor() {
    this._enabled = true;
    this._timer = null;
  }

  /**
   * 短震动（10ms）
   */
  short() {
    if (!this._enabled) return;
    wx.vibrateShort({ type: 'light' });
  }

  /**
   * 长震动（50ms）
   */
  long() {
    if (!this._enabled) return;
    wx.vibrateLong();
  }

  /**
   * 连续短震动
   * @param {number} times - 震动次数
   * @param {number} interval - 震动间隔（ms）
   */
  continuous(times = 3, interval = 300) {
    if (!this._enabled) return;

    this._clearTimer();
    let count = 0;

    this._timer = setInterval(() => {
      if (count >= times) {
        this._clearTimer();
        return;
      }
      this.short();
      count++;
    }, interval);
  }

  /**
   * 中奖震动组合（长震动 + 连续短震动）
   */
  winCombo() {
    if (!this._enabled) return;

    this.long();
    setTimeout(() => {
      this.continuous(3, 200);
    }, 300);
  }

  /**
   * 未中奖震动（温和）
   */
  miss() {
    if (!this._enabled) return;
    this.short();
  }

  /**
   * 启用/禁用震动
   * @param {boolean} enabled - 是否启用
   */
  setEnabled(enabled) {
    this._enabled = enabled;
    if (!enabled) {
      this._clearTimer();
    }
  }

  /**
   * 获取震动开关状态
   * @returns {boolean}
   */
  isEnabled() {
    return this._enabled;
  }

  /**
   * 清除定时器
   */
  _clearTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /**
   * 销毁震动管理器
   */
  destroy() {
    this._clearTimer();
  }
}

// 单例实例
let instance = null;

/**
 * 获取震动管理器单例
 * @returns {VibrateManager}
 */
function getVibrateManager() {
  if (!instance) {
    instance = new VibrateManager();
  }
  return instance;
}

module.exports = {
  getVibrateManager
};
