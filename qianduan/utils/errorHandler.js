/**
 * 统一错误处理工具
 * 提供一致的错误提示和日志记录
 */

const { ERROR_MESSAGES } = require('../config/constants.js');

/**
 * 错误码映射
 */
const ERROR_CODE_MAP = {
  401: ERROR_MESSAGES.LOGIN_EXPIRED,
  403: ERROR_MESSAGES.NO_PERMISSION,
  404: ERROR_MESSAGES.NOT_FOUND,
  500: ERROR_MESSAGES.SERVER_ERROR
};

/**
 * 统一错误处理类
 */
class ErrorHandler {
  /**
   * 处理错误并显示提示
   * @param {Error|Object} error - 错误对象
   * @param {Object} options - 配置选项
   * @param {boolean} options.showToast - 是否显示 Toast
   * @param {string} options.customMessage - 自定义错误消息
   * @param {Function} options.onError - 错误回调
   */
  static handle(error, options = {}) {
    const {
      showToast = true,
      customMessage = null,
      onError = null
    } = options;

    // 解析错误信息
    const errorInfo = this.parseError(error);

    // 显示提示
    if (showToast) {
      const message = customMessage || errorInfo.message;
      wx.showToast({
        title: message,
        icon: 'none',
        duration: 2500
      });
    }

    // 错误日志
    this.log(errorInfo);

    // 执行错误回调
    if (typeof onError === 'function') {
      onError(errorInfo);
    }

    return errorInfo;
  }

  /**
   * 解析错误对象
   * @param {Error|Object} error - 错误对象
   * @returns {Object} 标准化的错误信息
   */
  static parseError(error) {
    // 如果是标准错误对象
    if (error instanceof Error) {
      return {
        code: -1,
        message: error.message || ERROR_MESSAGES.SERVER_ERROR,
        stack: error.stack,
        timestamp: new Date().toISOString()
      };
    }

    // 如果是自定义错误对象
    if (typeof error === 'object' && error !== null) {
      const code = error.code || error.statusCode || -1;
      const message = error.message || ERROR_CODE_MAP[code] || ERROR_MESSAGES.SERVER_ERROR;

      return {
        code,
        message,
        data: error.data,
        timestamp: new Date().toISOString()
      };
    }

    // 其他情况
    return {
      code: -1,
      message: ERROR_MESSAGES.SERVER_ERROR,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * 记录错误日志
   * @param {Object} errorInfo - 错误信息
   */
  static log(errorInfo) {
    console.error('[ErrorHandler]', errorInfo);

    // 这里可以集成第三方日志服务（如阿里云日志、腾讯云日志等）
    // 例如：logService.report(errorInfo);
  }

  /**
   * 网络错误处理
   * @param {Object} error - 网络错误
   * @param {Object} options - 配置选项
   */
  static handleNetworkError(error, options = {}) {
    const errorInfo = {
      code: error.code || -1,
      message: error.message || ERROR_MESSAGES.NETWORK_ERROR,
      timestamp: new Date().toISOString()
    };

    if (options.showToast !== false) {
      wx.showToast({
        title: errorInfo.message,
        icon: 'none',
        duration: 2500
      });
    }

    this.log(errorInfo);
    return errorInfo;
  }

  /**
   * 业务错误处理
   * @param {Object} response - 响应对象
   * @param {Object} options - 配置选项
   */
  static handleBusinessError(response, options = {}) {
    const errorInfo = {
      code: response.code || -1,
      message: response.message || ERROR_MESSAGES.SERVER_ERROR,
      data: response.data,
      timestamp: new Date().toISOString()
    };

    if (options.showToast !== false) {
      wx.showToast({
        title: errorInfo.message,
        icon: 'none',
        duration: 2500
      });
    }

    this.log(errorInfo);
    return errorInfo;
  }

  /**
   * 登录过期处理
   */
  static handleLoginExpired() {
    // 清除本地登录信息
    wx.removeStorageSync('token');
    wx.removeStorageSync('openid');
    wx.removeStorageSync('userInfo');

    // 显示提示
    wx.showToast({
      title: ERROR_MESSAGES.LOGIN_EXPIRED,
      icon: 'none',
      duration: 2500
    });

    // 尝试自动重新登录
    const app = getApp();
    if (app && app.wxLogin) {
      setTimeout(() => {
        app.wxLogin().catch(() => {
          // 自动登录失败，不需要额外处理
        });
      }, 1000);
    }
  }
}

/**
 * 快捷方法：显示错误提示
 * @param {string} message - 错误消息
 * @param {number} duration - 持续时间
 */
function showError(message, duration = 2500) {
  wx.showToast({
    title: message,
    icon: 'none',
    duration
  });
}

/**
 * 快捷方法：显示成功提示
 * @param {string} message - 成功消息
 * @param {number} duration - 持续时间
 */
function showSuccess(message, duration = 2000) {
  wx.showToast({
    title: message,
    icon: 'success',
    duration
  });
}

/**
 * 快捷方法：显示加载中
 * @param {string} title - 加载文本
 */
function showLoading(title = '加载中...') {
  wx.showLoading({
    title,
    mask: true
  });
}

/**
 * 快捷方法：隐藏加载
 */
function hideLoading() {
  wx.hideLoading();
}

// CommonJS 导出（WeChat Mini Program 兼容）
module.exports = {
  ErrorHandler,
  showError,
  showSuccess,
  showLoading,
  hideLoading
};
