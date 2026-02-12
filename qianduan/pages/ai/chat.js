const app = getApp();

Page({
  data: {
    userInfo: null,
    messages: [],
    inputValue: '',
    toView: '',
    loading: false
  },

  onLoad() {
    this.setData({
      userInfo: wx.getStorageSync('userInfo')
    });
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
          messages: payloadMessages
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
