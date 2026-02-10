// 分享卡片组件
Component({
  properties: {
    // 标题
    title: {
      type: String,
      value: '邀请好友一起赚'
    },
    // 描述
    description: {
      type: String,
      value: '分享给好友，一起享受优惠'
    },
    // 邀请码
    inviteCode: {
      type: String,
      value: ''
    },
    // 是否显示二维码
    showQRCode: {
      type: Boolean,
      value: false
    },
    // QR码类型: canvas 或 image
    qrCodeType: {
      type: String,
      value: 'image'
    },
    // QR码 URL（当 qrCodeType 为 image 时）
    qrCodeUrl: {
      type: String,
      value: ''
    },
    // QR码尺寸
    qrSize: {
      type: Number,
      value: 200
    },
    // 是否显示复制链接按钮
    showCopyLink: {
      type: Boolean,
      value: true
    },
    // 是否显示分享按钮
    showShare: {
      type: Boolean,
      value: true
    },
    // 是否显示保存二维码按钮
    showSaveQR: {
      type: Boolean,
      value: false
    },
    // 分享链接
    shareLink: {
      type: String,
      value: ''
    },
    // 提示文字
    tip: {
      type: String,
      value: ''
    }
  },

  data: {},

  methods: {
    /**
     * 复制邀请码
     */
    onCopyInviteCode() {
      const code = this.properties.inviteCode;
      if (!code) {
        wx.showToast({ title: '邀请码为空', icon: 'none' });
        return;
      }

      wx.setClipboardData({
        data: code,
        success: () => {
          wx.showToast({
            title: '邀请码已复制',
            icon: 'success'
          });
          this.triggerEvent('copycode', { code });
        }
      });
    },

    /**
     * 复制邀请链接
     */
    onCopyLink() {
      let link = this.properties.shareLink;

      // 如果没有提供链接，则构造默认链接
      if (!link && this.properties.inviteCode) {
        link = `/pages/index/index?share_id=${this.properties.inviteCode}`;
      }

      if (!link) {
        wx.showToast({ title: '分享链接为空', icon: 'none' });
        return;
      }

      wx.setClipboardData({
        data: link,
        success: () => {
          wx.showToast({
            title: '链接已复制',
            icon: 'success'
          });
          this.triggerEvent('copylink', { link });
        }
      });
    },

    /**
     * 保存二维码到相册
     */
    onSaveQRCode() {
      // 如果是 image 类型，直接保存
      if (this.properties.qrCodeType === 'image' && this.properties.qrCodeUrl) {
        wx.downloadFile({
          url: this.properties.qrCodeUrl,
          success: (res) => {
            if (res.statusCode === 200) {
              wx.saveImageToPhotosAlbum({
                filePath: res.tempFilePath,
                success: () => {
                  wx.showToast({ title: '已保存到相册', icon: 'success' });
                  this.triggerEvent('saveqr');
                },
                fail: () => {
                  wx.showToast({ title: '保存失败', icon: 'none' });
                }
              });
            }
          }
        });
      } else if (this.properties.qrCodeType === 'canvas') {
        // Canvas 类型需要先转换为临时文件
        wx.canvasToTempFilePath({
          canvasId: 'shareQRCode',
          success: (res) => {
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => {
                wx.showToast({ title: '已保存到相册', icon: 'success' });
                this.triggerEvent('saveqr');
              },
              fail: () => {
                wx.showToast({ title: '保存失败', icon: 'none' });
              }
            });
          }
        }, this);
      } else {
        wx.showToast({ title: '二维码未生成', icon: 'none' });
      }
    }
  }
});
