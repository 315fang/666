const app = getApp();

Page({
  data: {
    userInfo: null,
    messages: [],
    inputValue: '',
    toView: '',
    loading: false,
    context: null // 当前页面上下文
  },

  onLoad(options) {
    this.setData({
      userInfo: wx.getStorageSync('userInfo')
    });

    // 接收上下文参数 (从globalData或options获取)
    // 优先使用 globalData 因为数据可能很大
    if (app.globalData.aiContext) {
      this.setData({ context: app.globalData.aiContext });
      
      // 如果有上下文，可以自动发送一条消息
      if (app.globalData.aiContext.type === 'product') {
        const product = app.globalData.aiContext.data;
        this.setData({
          messages: [{
            role: 'ai',
            content: `您好！我是您的智能助手。我看您正在浏览【${product.name}】，有什么我可以帮您的吗？` 
          }]
        });
        // Clear it to avoid reuse
        app.globalData.aiContext = null;
      }
    }
  },

  onInput(e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  async onSend() {
    const content = this.data.inputValue.trim();
    if (!content || this.data.loading) return;

    // Add user message
    const userMsg = { role: 'user', content };
    const messages = [...this.data.messages, userMsg];
    
    this.setData({
      messages,
      inputValue: '',
      toView: `msg-${messages.length - 1}`,
      loading: true
    });

    try {
      // Call backend API
      const response = await this.callAI(messages);
      
      const aiMsg = { role: 'ai', content: response };
      const newMessages = [...messages, aiMsg];
      
      this.setData({
        messages: newMessages,
        loading: false,
        toView: `msg-${newMessages.length - 1}`
      });

    } catch (error) {
      console.error(error);
      wx.showToast({
        title: '请求失败，请重试',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  callAI(messages) {
    return new Promise((resolve, reject) => {
      // Prepare payload (convert to simple format if needed)
      const payloadMessages = messages.map(m => ({
        role: m.role === 'ai' ? 'assistant' : 'user', // OpenAI uses 'assistant'
        content: m.content
      }));

      wx.request({
        url: `${app.globalData.baseUrl}/api/ai/chat`, // Ensure baseUrl is defined in app.js
        method: 'POST',
        header: {
          'Authorization': `Bearer ${wx.getStorageSync('token')}` // Assuming token auth
        },
        data: {
          messages: payloadMessages,
          context: this.data.context // 发送上下文到后端
        },
        success: (res) => {
          if (res.data.code === 200) {
            resolve(res.data.data.reply);
          } else {
            reject(new Error(res.data.message || 'API Error'));
          }
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  }
});
