/**
 * 图片懒加载工具
 * 使用 IntersectionObserver 实现懒加载
 */

class ImageLazyLoader {
  constructor(options = {}) {
    this.options = {
      rootMargin: '50px', // 提前 50px 开始加载
      threshold: 0.01, // 至少 1% 可见时触发
      placeholder: '/assets/images/placeholder.svg', // 占位图
      errorImage: '/assets/images/error.svg', // 错误图
      ...options
    };

    this.observers = new Map(); // 存储每个页面的 observer
    this.loadingImages = new Set(); // 正在加载的图片
  }

  /**
   * 初始化懒加载（在页面 onReady 中调用）
   * @param {Object} pageContext - 页面上下文（this）
   * @param {string} dataKey - 数据在 data 中的键名
   * @param {string} imageField - 图片字段名，默认 'image'
   */
  init(pageContext, dataKey, imageField = 'image') {
    // 微信小程序不支持 IntersectionObserver 的完整功能
    // 使用简化版本：直接加载可见区域的图片

    const observerKey = `${dataKey}_${imageField}`;

    // 创建 IntersectionObserver
    const observer = wx.createIntersectionObserver(pageContext, {
      thresholds: [this.options.threshold],
      observeAll: true
    });

    this.observers.set(observerKey, observer);

    return observer;
  }

  /**
   * 观察图片元素
   * @param {Object} pageContext - 页面上下文
   * @param {string} selector - 图片选择器
   * @param {Function} callback - 回调函数
   */
  observe(pageContext, selector, callback) {
    const observer = wx.createIntersectionObserver(pageContext, {
      thresholds: [this.options.threshold]
    });

    observer.relativeToViewport({ bottom: this.options.rootMargin })
      .observe(selector, (res) => {
        if (res.intersectionRatio > 0) {
          callback(res);
        }
      });

    return observer;
  }

  /**
   * 加载图片
   * @param {string} imageUrl - 图片 URL
   * @returns {Promise} 加载结果
   */
  loadImage(imageUrl) {
    return new Promise((resolve, reject) => {
      // 如果已在加载中，等待加载完成
      if (this.loadingImages.has(imageUrl)) {
        // 简单处理：直接返回 URL
        resolve(imageUrl);
        return;
      }

      this.loadingImages.add(imageUrl);

      // 预加载图片
      wx.getImageInfo({
        src: imageUrl,
        success: () => {
          this.loadingImages.delete(imageUrl);
          resolve(imageUrl);
        },
        fail: () => {
          this.loadingImages.delete(imageUrl);
          reject(new Error('图片加载失败'));
        }
      });
    });
  }

  /**
   * 批量预加载图片
   * @param {Array<string>} imageUrls - 图片 URL 数组
   * @param {number} concurrent - 并发数，默认 3
   * @returns {Promise} 加载结果
   */
  async preloadImages(imageUrls, concurrent = 3) {
    const results = [];
    const queue = [...imageUrls];

    // 并发加载
    const loadNext = async () => {
      if (queue.length === 0) return;

      const url = queue.shift();
      try {
        const result = await this.loadImage(url);
        results.push({ url, success: true, result });
      } catch (error) {
        results.push({ url, success: false, error: error.message });
      }

      // 继续加载下一张
      await loadNext();
    };

    // 启动并发任务
    const tasks = Array(Math.min(concurrent, imageUrls.length))
      .fill(0)
      .map(() => loadNext());

    await Promise.all(tasks);

    return results;
  }

  /**
   * 清理指定 observer
   * @param {string} observerKey - Observer 键名
   */
  disconnect(observerKey) {
    const observer = this.observers.get(observerKey);
    if (observer) {
      observer.disconnect();
      this.observers.delete(observerKey);
    }
  }

  /**
   * 清理所有 observers
   */
  disconnectAll() {
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
    this.loadingImages.clear();
  }
}

// 创建全局实例
const imageLazyLoader = new ImageLazyLoader();

/**
 * 图片懒加载 Behavior（用于组件）
 * 可以在组件中使用 behaviors: [imageLazyLoadBehavior]
 */
const imageLazyLoadBehavior = {
  data: {
    loadedImages: []
  },

  attached() {
    this._lazyLoadObserver = null;
  },

  detached() {
    if (this._lazyLoadObserver) {
      this._lazyLoadObserver.disconnect();
    }
  },

  methods: {
    /**
     * 启用懒加载
     * @param {string} selector - 图片选择器
     */
    enableLazyLoad(selector = '.lazy-image') {
      this._lazyLoadObserver = imageLazyLoader.observe(
        this,
        selector,
        (res) => {
          const dataset = res.dataset || {};
          const imageSrc = dataset.src;

          if (imageSrc && !this.data.loadedImages.includes(imageSrc)) {
            // 加载图片
            imageLazyLoader.loadImage(imageSrc).then(() => {
              this.setData({
                loadedImages: [...this.data.loadedImages, imageSrc]
              });
            });
          }
        }
      );
    }
  }
};

/**
 * 页面懒加载混入函数
 * 在页面中使用：Object.assign(pageConfig, createLazyLoadPage())
 */
function createLazyLoadPage() {
  return {
    data: {
      loadedImages: []
    },

    onReady() {
      // 子类可以覆盖此方法
    },

    onUnload() {
      if (this._lazyLoadObserver) {
        this._lazyLoadObserver.disconnect();
      }
    },

    /**
     * 标记图片已加载
     * @param {string} imageUrl - 图片 URL
     */
    markImageLoaded(imageUrl) {
      if (!this.data.loadedImages.includes(imageUrl)) {
        this.setData({
          loadedImages: [...this.data.loadedImages, imageUrl]
        });
      }
    },

    /**
     * 检查图片是否已加载
     * @param {string} imageUrl - 图片 URL
     * @returns {boolean}
     */
    isImageLoaded(imageUrl) {
      return this.data.loadedImages.includes(imageUrl);
    }
  };
}

// CommonJS 导出
module.exports = {
  ImageLazyLoader,
  imageLazyLoader,
  imageLazyLoadBehavior,
  createLazyLoadPage
};
