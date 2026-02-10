/**
 * 全局状态管理
 * 管理用户信息、购物车等全局状态
 */
const { createStore } = require('../utils/store.js');
const { USER_ROLES } = require('../config/constants.js');

// 创建全局 store
const globalStore = createStore({
  // 初始状态
  state: {
    // 用户信息
    userInfo: null,
    openid: null,
    token: null,
    isLoggedIn: false,
    roleLevel: USER_ROLES.GUEST,

    // 购物车
    cartCount: 0,
    cartItems: [],

    // 分销信息
    distributorId: null,
    parentInfo: null,

    // 系统配置
    systemConfig: {},

    // 网络状态
    isOnline: true
  },

  // 计算属性
  getters: {
    // 是否是会员
    isMember: (state) => state.roleLevel >= USER_ROLES.MEMBER,

    // 是否是团长
    isLeader: (state) => state.roleLevel >= USER_ROLES.LEADER,

    // 是否是代理商
    isAgent: (state) => state.roleLevel >= USER_ROLES.AGENT,

    // 角色名称
    roleName: (state) => {
      const roleNames = {
        [USER_ROLES.GUEST]: '普通用户',
        [USER_ROLES.MEMBER]: '会员',
        [USER_ROLES.LEADER]: '团长',
        [USER_ROLES.AGENT]: '代理商'
      };
      return roleNames[state.roleLevel] || '未知';
    },

    // 购物车总价
    cartTotalPrice: (state) => {
      return state.cartItems.reduce((total, item) => {
        return total + (item.price * item.quantity);
      }, 0);
    }
  },

  // 异步操作
  actions: {
    /**
     * 初始化用户信息
     */
    async initUser({ state, commit }) {
      try {
        // 从缓存读取
        const userInfo = wx.getStorageSync('userInfo');
        const openid = wx.getStorageSync('openid');
        const token = wx.getStorageSync('token');
        const distributorId = wx.getStorageSync('distributor_id');

        if (userInfo && openid && token) {
          commit({
            userInfo,
            openid,
            token,
            distributorId,
            isLoggedIn: true,
            roleLevel: userInfo.role_level || USER_ROLES.GUEST
          });
        }
      } catch (error) {
        console.error('初始化用户信息失败:', error);
      }
    },

    /**
     * 登录
     */
    async login({ commit }, { userInfo, openid, token }) {
      try {
        // 保存到缓存
        wx.setStorageSync('userInfo', userInfo);
        wx.setStorageSync('openid', openid);
        wx.setStorageSync('token', token);

        // 更新状态
        commit({
          userInfo,
          openid,
          token,
          isLoggedIn: true,
          roleLevel: userInfo.role_level || USER_ROLES.GUEST
        });

        return true;
      } catch (error) {
        console.error('登录失败:', error);
        return false;
      }
    },

    /**
     * 登出
     */
    async logout({ commit }) {
      try {
        // 清除缓存
        wx.removeStorageSync('userInfo');
        wx.removeStorageSync('openid');
        wx.removeStorageSync('token');

        // 重置状态
        commit({
          userInfo: null,
          openid: null,
          token: null,
          isLoggedIn: false,
          roleLevel: USER_ROLES.GUEST,
          cartCount: 0,
          cartItems: []
        });

        return true;
      } catch (error) {
        console.error('登出失败:', error);
        return false;
      }
    },

    /**
     * 更新购物车
     */
    async updateCart({ state, commit }, items) {
      const cartCount = items.reduce((count, item) => count + item.quantity, 0);
      commit({
        cartItems: items,
        cartCount
      });

      // 保存到缓存
      try {
        wx.setStorageSync('cartItems', items);
      } catch (error) {
        console.error('保存购物车失败:', error);
      }
    },

    /**
     * 添加到购物车
     */
    async addToCart({ state, dispatch }, item) {
      const cartItems = [...state.cartItems];
      const existingItem = cartItems.find(i =>
        i.product_id === item.product_id && i.sku_id === item.sku_id
      );

      if (existingItem) {
        existingItem.quantity += item.quantity;
      } else {
        cartItems.push(item);
      }

      await dispatch('updateCart', cartItems);
    },

    /**
     * 从购物车移除
     */
    async removeFromCart({ state, dispatch }, { productId, skuId }) {
      const cartItems = state.cartItems.filter(item =>
        !(item.product_id === productId && item.sku_id === skuId)
      );
      await dispatch('updateCart', cartItems);
    }
  }
});

// 初始化时加载用户信息
globalStore.dispatch('initUser');

// CommonJS 导出
module.exports = globalStore;
