/**
 * 空状态组件
 * 用于显示无数据、无搜索结果等场景
 */
Component({
  properties: {
    // 图标路径
    icon: {
      type: String,
      value: '/assets/images/empty.svg'
    },
    // 标题
    title: {
      type: String,
      value: '暂无数据'
    },
    // 描述文本（可选）
    description: {
      type: String,
      value: ''
    },
    // 按钮文本（可选）
    buttonText: {
      type: String,
      value: ''
    }
  },

  methods: {
    onButtonTap() {
      this.triggerEvent('buttonclick');
    }
  }
});
