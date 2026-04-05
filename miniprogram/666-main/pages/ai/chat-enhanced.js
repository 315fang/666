const app = getApp();

/**
 * 增强版AI聊天页面
 * 
 * 特性：
 * - 支持富文本展示（商品卡片、订单卡片）
 * - 快捷操作按钮
 * - 会话历史
 * - 上下文感知
 */
Page({
  data: {
    userInfo: null,
    messages: [],
    inputValue: '',
    toView: '',
    loading: false,
    context: null,
    sessionId: null,
    quickActions: [],
    showQuickActions: true,
    isFirstLoad: true
  },

  onLoad(options) {
    this.setData({
      userInfo: wx.getStorageSync('userInfo')
    });

    // 检查上下文
    this.checkContext();

    // 加载快捷操作
    this.loadQuickActions();

    // 加载欢迎消息
    if (this.data.isFirstLoad) {
      this.addWelcomeMessage();
    }
  },

  onShow() {
    // 每次显示时更新购物车数量等
    this.updateCartBadge();
  },

  /**
   * 检查并处理上下文
   */
  checkContext() {
    const app = getApp();
    
    if (app.globalData.aiContext) {
      const context = app.globalData.aiContext;
      this.setData({ context });
      
      // 根据上下文类型生成欢迎语
      let welcomeMsg = '';
      switch(context.type) {
        case 'product':
          welcomeMsg = `您好！我是您的智能助手小臻\n\n我看您正在浏览【${context.data.name}】，售价¥${context.data.price}。\n\n我可以帮您：\n• 了解商品详情\n• 计算优惠价格\n• 添加到购物车\n• 直接下单购买\n\n请问有什么可以帮您的吗？`;
          break;
        case 'order':
          welcomeMsg = `您好！关于订单【${context.data.orderNo}】，我可以帮您查询物流、申请售后或解答任何问题。`;
          break;
        case 'cart':
          welcomeMsg = `您好！您购物车里有${context.data.itemCount}件商品，需要我帮您结算或推荐更多好物吗？`;
          break;
        default:
          welcomeMsg = '您好！我是小臻，您的智能购物助手\n有什么可以帮您的吗？';
      }

      this.setData({
        messages: [{
          role: 'ai',
          type: 'text',
          content: welcomeMsg,
          time: new Date().toLocaleTimeString()
        }],
        isFirstLoad: false
      });

      // 清空上下文避免重复
      app.globalData.aiContext = null;
    }
  },

  /**
   * 添加欢迎消息
   */
  addWelcomeMessage() {
    const hour = new Date().getHours();
    let greeting = '您好';
    if (hour < 12) greeting = '早上好';
    else if (hour < 18) greeting = '下午好';
    else greeting = '晚上好';

    this.setData({
      messages: [{
        role: 'ai',
        type: 'text',
        content: `${greeting}！我是小臻\n\n我可以帮您：\n• 搜索商品\n• 查询订单\n• 计算价格\n• 管理购物车\n• 解答问题\n\n点击下方的快捷按钮，或直接输入您的问题~`,
        time: new Date().toLocaleTimeString()
      }],
      isFirstLoad: false
    });
  },

  /**
   * 加载快捷操作
   */
  async loadQuickActions() {
    try {
      const res = await this.request({
        url: `${app.globalData.baseUrl}/api/v2/ai/quick-actions`,
        method: 'GET'
      });

      if (res.data.code === 200) {
        this.setData({
          quickActions: res.data.data.actions
        });
      }
    } catch (error) {
      // 使用默认快捷操作
      this.setData({
        quickActions: [
          { id: 'hot', label: '热门商品', icon: '/assets/icons/hot.svg', message: '推荐几款热销商品' },
          { id: 'orders', label: '我的订单', icon: '/assets/icons/clipboard.svg', message: '查看我的订单' },
          { id: 'policy', label: '退款政策', icon: '/assets/icons/refresh-cw.svg', message: '退款政策' }
        ]
      });
    }
  },

  /**
   * 输入框变化
   */
  onInput(e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  /**
   * 发送消息
   */
  async onSend() {
    const content = this.data.inputValue.trim();
    if (!content || this.data.loading) return;

    await this.sendMessage(content);
  },

  /**
   * 发送快捷消息
   */
  async onQuickAction(e) {
    const { action } = e.currentTarget.dataset;
    await this.sendMessage(action.message);
  },

  /**
   * 发送消息核心逻辑
   */
  async sendMessage(content) {
    // 添加用户消息
    const userMsg = {
      role: 'user',
      type: 'text',
      content,
      time: new Date().toLocaleTimeString()
    };

    const messages = [...this.data.messages, userMsg];
    
    this.setData({
      messages,
      inputValue: '',
      toView: `msg-${messages.length - 1}`,
      loading: true,
      showQuickActions: false
    });

    try {
      // 调用新版AI接口
      const response = await this.callAI(content);
      
      // 处理AI回复
      await this.handleAIResponse(response);

    } catch (error) {
      console.error('AI请求失败:', error);
      
      const errorMsg = {
        role: 'ai',
        type: 'text',
        content: '抱歉，服务暂时不可用，请稍后再试',
        time: new Date().toLocaleTimeString()
      };

      this.setData({
        messages: [...this.data.messages, errorMsg],
        loading: false,
        toView: `msg-${this.data.messages.length}`
      });
    }
  },

  /**
   * 调用AI接口
   */
  callAI(message) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${app.globalData.baseUrl}/api/v2/ai/chat`,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${wx.getStorageSync('token')}`
        },
        data: {
          message,
          session_id: this.data.sessionId,
          context: this.data.context
        },
        success: (res) => {
          if (res.data.code === 200) {
            resolve(res.data.data);
          } else {
            reject(new Error(res.data.message || '请求失败'));
          }
        },
        fail: reject
      });
    });
  },

  /**
   * 处理AI响应
   */
  async handleAIResponse(response) {
    const { reply, session_id, actions, tool_used } = response;

    // 更新会话ID
    if (session_id && !this.data.sessionId) {
      this.setData({ sessionId });
    }

    // 构建AI消息
    const aiMsg = {
      role: 'ai',
      type: 'text',
      content: reply,
      time: new Date().toLocaleTimeString(),
      toolUsed: tool_used
    };

    // 解析富文本内容（商品卡片、订单卡片等）
    const richContent = this.parseRichContent(reply);
    if (richContent) {
      aiMsg.richContent = richContent;
    }

    const newMessages = [...this.data.messages, aiMsg];

    this.setData({
      messages: newMessages,
      loading: false,
      toView: `msg-${newMessages.length - 1}`
    });

    // 处理操作指令
    if (actions && actions.length > 0) {
      await this.handleActions(actions);
    }
  },

  /**
   * 解析富文本内容
   */
  parseRichContent(text) {
    // 检测商品列表
    const productPattern = /(\d+\.\s+.+?¥\d+\.?\d*)/g;
    if (productPattern.test(text)) {
      // 提取商品信息并生成卡片数据
      // 简化版，实际应该更复杂的解析
      return null;
    }
    return null;
  },

  /**
   * 处理操作指令
   */
  async handleActions(actions) {
    for (const action of actions) {
      switch (action.type) {
        case 'cart_update':
          // 更新购物车角标
          this.updateCartBadge(action.count);
          wx.showToast({
            title: `购物车已更新`,
            icon: 'success'
          });
          break;
        
        case 'confirm_order':
          // 显示确认对话框
          wx.showModal({
            title: '确认下单',
            content: `即将为您创建订单，是否继续？`,
            success: (res) => {
              if (res.confirm) {
                // 跳转到确认订单页
                wx.navigateTo({
                  url: `/pages/order/confirm?quick=1&product_id=${action.data.productId}&quantity=${action.data.quantity}`
                });
              }
            }
          });
          break;

        case 'navigate':
          // 导航到指定页面
          if (action.data && action.data.url) {
            wx.navigateTo({ url: action.data.url });
          }
          break;
      }
    }
  },

  /**
   * 更新购物车角标
   */
  updateCartBadge(count) {
    if (count !== undefined) {
      wx.setStorageSync('cartCount', count);
    }
    // 触发全局更新
    const app = getApp();
    if (app.updateCartBadge) {
      app.updateCartBadge();
    }
  },

  /**
   * 重新显示快捷操作
   */
  onShowQuickActions() {
    this.setData({
      showQuickActions: true
    });
  },

  /**
   * 复制消息
   */
  onCopyMessage(e) {
    const { content } = e.currentTarget.dataset;
    wx.setClipboardData({
      data: content,
      success: () => {
        wx.showToast({ title: '已复制', icon: 'success' });
      }
    });
  },

  /**
   * 长按消息
   */
  onMessageLongPress(e) {
    const { content } = e.currentTarget.dataset;
    wx.showActionSheet({
      itemList: ['复制', '转发'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.onCopyMessage({ currentTarget: { dataset: { content } } });
        }
      }
    });
  }
});
