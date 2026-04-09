// pages/splash/splash.js
// 移植自 hemeimei_v5.jsx：深紫渐变 + 上滑分层展示动画
// 支持后台 show_mode 控制：always / daily / once / disabled

const app = getApp();

// ── 颜色渐变系统 ──────────────────────────────────────────
const DEFAULT_GRAD = [
  { at: 0.00, c: [38,  6,  80] },
  { at: 0.25, c: [72, 30, 120] },
  { at: 0.50, c: [140,100,185] },
  { at: 0.72, c: [210,185,230] },
  { at: 1.00, c: [247,244,239] }
];

let GRAD = DEFAULT_GRAD;

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function buildGradFromConfig(startColor, endColor) {
  try {
    const s = hexToRgb(startColor);
    const e = hexToRgb(endColor);
    const mid = s.map((v, i) => Math.round(v + (e[i] - v) * 0.5));
    return [
      { at: 0.00, c: s },
      { at: 0.50, c: mid },
      { at: 1.00, c: e }
    ];
  } catch (_) {
    return DEFAULT_GRAD;
  }
}

function sampleColor(p) {
  p = Math.max(0, Math.min(1, p));
  for (let i = 1; i < GRAD.length; i++) {
    if (p <= GRAD[i].at) {
      const prev = GRAD[i - 1];
      const next = GRAD[i];
      const t = (p - prev.at) / (next.at - prev.at);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      return prev.c.map((v, j) => Math.round(v + (next.c[j] - v) * ease));
    }
  }
  return GRAD[GRAD.length - 1].c;
}

function rgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }

function getTextColor(p) {
  if (p < 0.55) return '#FFFFFF';
  const t = (p - 0.55) / 0.45;
  return `rgb(${Math.round(255 - t * 210)},${Math.round(255 - t * 228)},${Math.round(255 - t * 194)})`;
}

function getSubColor(p) {
  if (p < 0.55) return 'rgba(255,255,255,0.5)';
  return `rgba(60,20,100,${(0.45 + (p - 0.55) * 0.3).toFixed(2)})`;
}

function getArrowColor(p) {
  if (p < 0.45) return 'rgba(255,255,255,0.35)';
  return 'rgba(120,70,180,0.4)';
}

// ── show_mode 判断逻辑 ──────────────────────────────────────
const SPLASH_SEEN_KEY = 'splash_seen_date';
const SPLASH_SEEN_ONCE_KEY = 'splash_seen_once';

function shouldShowSplash(config) {
  if (!config || !config.is_active) return false;
  const mode = config.show_mode;
  if (mode === 'disabled') return false;
  if (mode === 'always') return true;
  if (mode === 'once') {
    const seen = wx.getStorageSync(SPLASH_SEEN_ONCE_KEY);
    return !seen;
  }
  if (mode === 'daily') {
    const today = new Date().toDateString();
    const lastSeen = wx.getStorageSync(SPLASH_SEEN_KEY);
    return lastSeen !== today;
  }
  return false;
}

function markSplashSeen(mode) {
  if (mode === 'once') {
    wx.setStorageSync(SPLASH_SEEN_ONCE_KEY, true);
  } else if (mode === 'daily') {
    wx.setStorageSync(SPLASH_SEEN_KEY, new Date().toDateString());
  }
}

function resolveSplashImage(config = {}) {
  return config.image || config.file_id || config.image_url || '';
}

Page({
  data: {
    phase: 'flood',      // flood | interact | done
    floodP: 0,           // 0→1，flood 动画进度
    globalP: 0,          // 0→1，interact 总进度（跟上滑走）
    bgColor: rgb(sampleColor(0.05)),
    nextLayerColor: '',
    inLp: 0,             // 当前层内部进度

    layerIndex: 0,
    wordAnim: 'idle',    // idle | in | hold | out

    titleColor: '#FFFFFF',
    subColor: 'rgba(255,255,255,0.5)',
    arrowColor: 'rgba(255,255,255,0.35)',
    arrowOpacity: 1,

    currentLayer: null,
    isReveal: false,
    progressDots: [],
    showSkip: false,
    skipText: '跳过',
    countdown: 0,

    splashConfig: null,
    splashBgImage: '',
    layers: [],
    TOTAL: 3
  },

  // ── 内部状态（不放 data，避免频繁 setData）──────────────
  _dragY: null,
  _baseP: 0,
  _liveP: 0,
  _snapping: false,
  _transit: false,
  _wordTimer: null,
  _rafTimer: null,
  _countdownTimer: null,

  onLoad() {
    if (app.globalData.splashConfig) {
      this._bootWithConfig(app.globalData.splashConfig);
      return;
    }

    const splashPromise = app.prefetchSplashConfig ? app.prefetchSplashConfig() : app.globalData.splashConfigPromise;
    if (splashPromise && typeof splashPromise.then === 'function') {
      // 最多等 2s，超时直接跳首页，防止接口慢或本地无服务时卡在紫屏
      let done = false;
      const guard = setTimeout(() => {
        if (!done && !this._destroyed) { done = true; this._redirect(); }
      }, 2000);

      splashPromise.then((config) => {
        if (done || this._destroyed || this.data.splashConfig) return;
        done = true;
        clearTimeout(guard);
        this._bootWithConfig(config);
      }).catch(() => {
        if (done || this._destroyed) return;
        done = true;
        clearTimeout(guard);
        this._redirect();
      });
      return;
    }

    this._redirect();
  },

  _bootWithConfig(config) {
    if (!config || !shouldShowSplash(config)) {
      this._redirect();
      return;
    }
    this._init(config);
  },

  _init(config) {
    // 应用后台配置的渐变色（若有）
    if (config.bg_color_start && config.bg_color_end) {
      GRAD = buildGradFromConfig(config.bg_color_start, config.bg_color_end);
    } else {
      GRAD = DEFAULT_GRAD;
    }

    const singleLayers = (config.layers || []).map(l => ({ ...l, type: 'single' }));
    const revealLayer = {
      type: 'reveal',
      title: config.title || app.globalData.brandName || '问兰',
      sub: config.subtitle || '',
      credit: config.credit || '',
      en: config.en_title || 'WENLAN'
    };
    const layers = [...singleLayers, revealLayer];
    const TOTAL = layers.length;
    const STEP = 1 / TOTAL;

    this._layers = layers;
    this._TOTAL = TOTAL;
    this._STEP = STEP;
    this._THRESH = 0.30;

    const dotCount = singleLayers.length;
    const progressDots = Array.from({ length: dotCount }, (_, i) => ({ active: i === 0 }));

    this.setData({
      splashConfig: config,
      splashBgImage: resolveSplashImage(config),
      layers,
      TOTAL,
      skipText: config.skip_text || '跳过',
      progressDots
    });

    // 启动 flood 动画
    this._startFlood();

    // 配置自动跳过倒计时（flood 结束后开始）
    this._duration = Number(config.duration) || 0;
  },

  // ── flood 动画（1800ms easeOutCubic）──────────────────────
  _startFlood() {
    const startTime = Date.now();
    const FLOOD_MS = 1800;

    const tick = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / FLOOD_MS, 1);
      const floodP = 1 - Math.pow(1 - t, 3);

      this._liveP = 0;
      const bgC = sampleColor(floodP * 0.05);
      this.setData({ floodP, bgColor: rgb(bgC) });

      if (t < 1) {
        this._rafTimer = setTimeout(tick, 16);
      } else {
        setTimeout(() => {
          this.setData({ phase: 'interact', showSkip: true });
          this._wordIn(0);
          // 启动倒计时
          if (this._duration > 0) this._startCountdown();
        }, 200);
      }
    };

    tick();
  },

  // ── 倒计时自动跳过 ─────────────────────────────────────────
  _startCountdown() {
    let remaining = Math.ceil(this._duration / 1000);
    this.setData({ countdown: remaining });
    this._countdownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(this._countdownTimer);
        this.setData({ countdown: 0 });
        this._redirect();
      } else {
        this.setData({ countdown: remaining });
      }
    }, 1000);
  },

  // ── 词动画 ────────────────────────────────────────────────
  _wordIn(idx) {
    clearTimeout(this._wordTimer);
    const layer = this._layers[idx];
    const isReveal = layer.type === 'reveal';
    const dotCount = this._layers.filter(l => l.type === 'single').length;
    const progressDots = Array.from({ length: dotCount }, (_, i) => ({ active: i <= idx }));

    this.setData({
      layerIndex: idx,
      currentLayer: layer,
      isReveal,
      wordAnim: 'in',
      progressDots
    });

    this._wordTimer = setTimeout(() => {
      this.setData({ wordAnim: 'hold' });
    }, 540);
  },

  _wordOut(cb) {
    clearTimeout(this._wordTimer);
    this.setData({ wordAnim: 'out' });
    this._wordTimer = setTimeout(() => {
      cb && cb();
    }, 300);
  },

  // ── snap 动画（手指松开后弹性还原/前进）──────────────────
  _snapTo(from, to, done) {
    this._snapping = true;
    const startTime = Date.now();
    const SNAP_MS = 460;

    const go = () => {
      const t = Math.min((Date.now() - startTime) / SNAP_MS, 1);
      const e = 1 - Math.pow(1 - t, 3);
      const p = from + (to - from) * e;
      this._liveP = p;
      this._updateGlobalP(p);

      if (t < 1) {
        this._rafTimer = setTimeout(go, 16);
      } else {
        this._snapping = false;
        done && done();
      }
    };
    go();
  },

  // ── 更新 globalP 关联的所有派生状态 ──────────────────────
  _updateGlobalP(p) {
    const layerIdx = Math.min(Math.floor(p / this._STEP), this._TOTAL - 1);
    const inLp = Math.max(0, (p - layerIdx * this._STEP) / this._STEP);
    const arrowA = Math.max(0, 1 - inLp * 4);

    const bgC = sampleColor(p);
    const nextC = sampleColor(Math.min((layerIdx + 1) * this._STEP, 1));

    this.setData({
      globalP: p,
      inLp,
      bgColor: rgb(bgC),
      nextLayerColor: rgb(nextC),
      titleColor: getTextColor(p),
      subColor: getSubColor(p),
      arrowColor: getArrowColor(p),
      arrowOpacity: arrowA
    });
  },

  _advance(next) {
    this._transit = true;
    this._wordOut(() => {
      if (next >= this._TOTAL) {
        this._doReveal();
        return;
      }
      this._wordIn(next);
      this._transit = false;
    });
  },

  _doReveal() {
    const revealIdx = this._TOTAL - 1;
    this._wordIn(revealIdx);
    // Reveal 展示 1.4s 后跳转
    setTimeout(() => {
      this._redirect();
    }, 1400);
  },

  // ── 跳转到首页 ────────────────────────────────────────────
  _redirect() {
    clearTimeout(this._rafTimer);
    clearTimeout(this._wordTimer);
    clearInterval(this._countdownTimer);

    const config = this.data.splashConfig;
    if (config) markSplashSeen(config.show_mode);

    wx.switchTab({ url: '/pages/index/index' });
  },

  // ── 跳过按钮 ──────────────────────────────────────────────
  handleSkip() {
    this._redirect();
  },

  // ── 触摸事件 ──────────────────────────────────────────────
  onTouchStart(e) {
    if (this.data.phase !== 'interact' || this._snapping || this._transit) return;
    this._dragY = e.touches[0].clientY;
    this._baseP = this._liveP;
  },

  onTouchMove(e) {
    if (this._dragY === null || this._snapping) return;
    const delta = this._dragY - e.touches[0].clientY;

    if (delta < 0) {
      // 向上拉（反向），略微跟随，有弹性
      this._liveP = Math.max(0, this._baseP + delta * 0.02);
      this._updateGlobalP(this._liveP);
      return;
    }

    const p = Math.min(this._baseP + (delta / (260 * 2)) * this._STEP, 1);
    this._liveP = p;
    this._updateGlobalP(p);

    const nl = Math.min(Math.floor(p / this._STEP), this._TOTAL - 1);
    if (nl > this.data.layerIndex && !this._transit) {
      this._advance(nl);
    }

    if (p >= 1 && !this._transit) {
      this._dragY = null;
      this._transit = true;
      this._wordOut(() => this._doReveal());
    }
  },

  onTouchEnd() {
    if (this._dragY === null) return;
    const savedDragY = this._dragY;
    this._dragY = null;

    if (this._snapping || this._transit) return;

    const layerIdx = this.data.layerIndex;
    const base = layerIdx * this._STEP;
    const inL = (this._liveP - base) / this._STEP;

    if (inL >= this._THRESH) {
      const nextTarget = Math.min((layerIdx + 1) * this._STEP, 1);
      this._snapTo(this._liveP, nextTarget, () => {
        if (layerIdx + 1 >= this._TOTAL) {
          this._doReveal();
          return;
        }
        this._advance(layerIdx + 1);
      });
    } else {
      this._snapTo(this._liveP, base, null);
    }
  },

  onUnload() {
    this._destroyed = true;
    clearTimeout(this._rafTimer);
    clearTimeout(this._wordTimer);
    clearInterval(this._countdownTimer);
  }
});
