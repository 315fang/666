/**
 * 音效管理器
 * 管理背景音乐和各种音效播放
 * 使用单例模式
 */

// 音频文件路径配置
const AUDIO_PATHS = {
  bgm: '/assets/audio/bgm.mp3',
  click: '/assets/audio/click.mp3',
  machine: '/assets/audio/machine.mp3',
  win: '/assets/audio/win.mp3',
  miss: '/assets/audio/miss.mp3',
  drop: '/assets/audio/drop.mp3'
};

class AudioManager {
  constructor() {
    this._enabled = true;
    this._bgmContext = null;
    this._machineContext = null;
    this._effectContexts = [];
    this._init();
  }

  _init() {
    // 创建背景音乐上下文
    this._bgmContext = wx.createInnerAudioContext();
    this._bgmContext.src = AUDIO_PATHS.bgm;
    this._bgmContext.loop = true;

    // 创建机器运转音效上下文（可独立控制）
    this._machineContext = wx.createInnerAudioContext();
    this._machineContext.src = AUDIO_PATHS.machine;
    this._machineContext.loop = true;
  }

  /**
   * 播放背景音乐
   */
  playBGM() {
    if (!this._enabled) return;
    this._bgmContext.play();
  }

  /**
   * 停止背景音乐
   */
  stopBGM() {
    this._bgmContext.stop();
  }

  /**
   * 暂停背景音乐
   */
  pauseBGM() {
    this._bgmContext.pause();
  }

  /**
   * 播放音效（单次播放，播放完成后销毁）
   * @param {string} src - 音频路径
   * @returns {Promise<void>}
   */
  _playEffect(src) {
    if (!this._enabled) return Promise.resolve();

    return new Promise((resolve) => {
      const ctx = wx.createInnerAudioContext();
      ctx.src = src;
      this._effectContexts.push(ctx);

      ctx.onEnded(() => {
        this._removeContext(ctx);
        ctx.destroy();
        resolve();
      });

      ctx.onError(() => {
        this._removeContext(ctx);
        ctx.destroy();
        resolve();
      });

      ctx.play();
    });
  }

  /**
   * 从列表中移除音频上下文
   * @param {Object} ctx - 音频上下文
   */
  _removeContext(ctx) {
    const index = this._effectContexts.indexOf(ctx);
    if (index > -1) {
      this._effectContexts.splice(index, 1);
    }
  }

  /**
   * 播放按钮点击音效
   */
  playClick() {
    this._playEffect(AUDIO_PATHS.click);
  }

  /**
   * 播放机器运转音效
   */
  playMachine() {
    if (!this._enabled) return;
    this._machineContext.play();
  }

  /**
   * 停止机器运转音效
   */
  stopMachine() {
    this._machineContext.stop();
  }

  /**
   * 播放中奖音效
   */
  playWin() {
    this._playEffect(AUDIO_PATHS.win);
  }

  /**
   * 播放未中奖音效
   */
  playMiss() {
    this._playEffect(AUDIO_PATHS.miss);
  }

  /**
   * 播放扭蛋掉落音效
   */
  playDrop() {
    this._playEffect(AUDIO_PATHS.drop);
  }

  /**
   * 启用/禁用音效
   * @param {boolean} enabled - 是否启用
   */
  setEnabled(enabled) {
    this._enabled = enabled;
    if (!enabled) {
      this.pauseBGM();
      this.stopMachine();
    }
  }

  /**
   * 获取音效开关状态
   * @returns {boolean}
   */
  isEnabled() {
    return this._enabled;
  }

  /**
   * 销毁所有音频上下文
   */
  destroy() {
    // 停止并销毁背景音乐
    if (this._bgmContext) {
      this._bgmContext.stop();
      this._bgmContext.destroy();
      this._bgmContext = null;
    }

    // 停止并销毁机器音效
    if (this._machineContext) {
      this._machineContext.stop();
      this._machineContext.destroy();
      this._machineContext = null;
    }

    // 销毁所有单次播放的音效上下文
    this._effectContexts.forEach(ctx => {
      ctx.stop();
      ctx.destroy();
    });
    this._effectContexts = [];
  }
}

// 单例实例
let instance = null;

/**
 * 获取音效管理器单例
 * @returns {AudioManager}
 */
function getAudioManager() {
  if (!instance) {
    instance = new AudioManager();
  }
  return instance;
}

module.exports = {
  getAudioManager
};
