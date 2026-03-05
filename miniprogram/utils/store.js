/**
 * 简单的状态管理系统
 * 基于观察者模式，适用于 WeChat Mini Program
 */

class Store {
  constructor(options = {}) {
    this.state = options.state || {};
    this.getters = {};
    this.actions = options.actions || {};
    this.observers = new Map(); // 存储观察者

    // 初始化 getters
    if (options.getters) {
      Object.keys(options.getters).forEach(key => {
        Object.defineProperty(this.getters, key, {
          get: () => options.getters[key](this.state)
        });
      });
    }

    // 代理 state，实现响应式
    this.state = this._createReactiveState(this.state);
  }

  /**
   * 创建响应式状态
   * @private
   */
  _createReactiveState(state) {
    const self = this;
    return new Proxy(state, {
      set(target, key, value) {
        const oldValue = target[key];
        target[key] = value;

        // 值改变时通知观察者
        if (oldValue !== value) {
          self._notifyObservers(key, value, oldValue);
        }
        return true;
      }
    });
  }

  /**
   * 获取状态
   * @param {string} key - 状态键
   * @returns {*} 状态值
   */
  get(key) {
    return this.state[key];
  }

  /**
   * 设置状态
   * @param {string|Object} key - 状态键或对象
   * @param {*} value - 状态值
   */
  set(key, value) {
    if (typeof key === 'object') {
      Object.keys(key).forEach(k => {
        this.state[k] = key[k];
      });
    } else {
      this.state[key] = value;
    }
  }

  /**
   * 执行 action
   * @param {string} actionName - action 名称
   * @param {*} payload - 参数
   * @returns {Promise<*>} 执行结果
   */
  async dispatch(actionName, payload) {
    const action = this.actions[actionName];
    if (!action) {
      console.warn(`Action "${actionName}" not found`);
      return;
    }

    return await action.call(this, {
      state: this.state,
      getters: this.getters,
      dispatch: this.dispatch.bind(this),
      commit: this.set.bind(this)
    }, payload);
  }

  /**
   * 订阅状态变化
   * @param {string|Array} keys - 要监听的键（可以是单个或数组）
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消订阅函数
   */
  subscribe(keys, callback) {
    const keyList = Array.isArray(keys) ? keys : [keys];
    const observerId = `${Date.now()}_${Math.random()}`;

    keyList.forEach(key => {
      if (!this.observers.has(key)) {
        this.observers.set(key, new Map());
      }
      this.observers.get(key).set(observerId, callback);
    });

    // 返回取消订阅函数
    return () => {
      keyList.forEach(key => {
        this.observers.get(key)?.delete(observerId);
      });
    };
  }

  /**
   * 通知观察者
   * @private
   */
  _notifyObservers(key, newValue, oldValue) {
    const observers = this.observers.get(key);
    if (observers) {
      observers.forEach(callback => {
        callback(newValue, oldValue);
      });
    }
  }

  /**
   * 重置状态
   * @param {Object} newState - 新状态（可选）
   */
  reset(newState) {
    if (newState) {
      Object.keys(newState).forEach(key => {
        this.state[key] = newState[key];
      });
    } else {
      Object.keys(this.state).forEach(key => {
        this.state[key] = undefined;
      });
    }
  }
}

/**
 * 连接页面到 store（类似 React-Redux 的 connect）
 * @param {Store} store - store 实例
 * @param {Function} mapStateToData - 映射状态到页面 data 的函数
 * @returns {Object} 页面配置对象
 */
function connectPage(store, mapStateToData) {
  return {
    onLoad() {
      // 初始化映射状态
      const mappedData = mapStateToData(store.state, store.getters);
      this.setData(mappedData);

      // 订阅状态变化
      this._unsubscribe = store.subscribe(
        Object.keys(mappedData),
        () => {
          const newData = mapStateToData(store.state, store.getters);
          this.setData(newData);
        }
      );
    },

    onUnload() {
      // 取消订阅
      if (this._unsubscribe) {
        this._unsubscribe();
      }
    }
  };
}

/**
 * 创建全局 store 实例
 */
function createStore(options) {
  return new Store(options);
}

// CommonJS 导出
module.exports = {
  Store,
  createStore,
  connectPage
};
