export const imageSpecs = [
  {
    key: 'product_detail',
    name: '商品详情首图 / 分类弹层大图',
    ratio: '3:4 竖图',
    minSize: '1200 x 1600',
    display: '固定竖图容器，前端满铺填充展示',
    note: '主体居中，四边预留 8% 安全区，避免边角文案被裁'
  },
  {
    key: 'product_thumb',
    name: '商品卡缩略图 / 订单商品图',
    ratio: '1:1 正方图',
    minSize: '800 x 800',
    display: '固定正方形容器，前端满铺裁切',
    note: '商品主体尽量铺满，不要在四角放小字'
  },
  {
    key: 'home',
    name: '首页轮播主视觉（home）',
    ratio: '9:16 竖图',
    minSize: '1242 x 2208',
    display: '全屏主视觉展示，前端会做沉浸式裁切',
    note: '标题、人物、商品主体放在中间 70% 安全区'
  },
  {
    key: 'poster',
    name: '首页中部/底部海报（home_mid / home_bottom）',
    ratio: '3:4 竖图',
    minSize: '1080 x 1440',
    display: '按宽度展示，保持统一画报比例',
    note: '适合单张活动海报、礼盒图、场景图'
  },
  {
    key: 'category',
    name: '分类页 Banner（category）',
    ratio: '3:4 竖图',
    minSize: '1080 x 1440',
    display: '与商品详情首图统一，前端满铺裁切',
    note: '主商品和标题尽量居中，避免贴边'
  },
  {
    key: 'activity',
    name: '活动页图片条（activity）',
    ratio: '3:2 横图',
    minSize: '1500 x 1000',
    display: '固定横图容器，前端满铺裁切',
    note: '左右会有轻微裁切，主要信息放中间区域'
  },
  {
    key: 'article',
    name: '图文正文插图 / 商品详情图',
    ratio: '3:4 竖图或长图',
    minSize: '宽度 1080 以上',
    display: '正文内按宽度自适应显示，不强制裁切',
    note: '建议单张 2MB 内，长图拆段上传，避免首屏过长'
  }
]

export const bannerPositionSpecMap = {
  home: imageSpecs.find(item => item.key === 'home'),
  home_mid: imageSpecs.find(item => item.key === 'poster'),
  home_bottom: imageSpecs.find(item => item.key === 'poster'),
  category: imageSpecs.find(item => item.key === 'category'),
  activity: imageSpecs.find(item => item.key === 'activity')
}

export const bannerLinkTypeMap = {
  none: { label: '无跳转', tagType: 'info' },
  product: { label: '商品详情', tagType: 'primary' },
  activity: { label: '活动页面', tagType: 'warning' },
  category: { label: '分类页定位', tagType: 'success' },
  group_buy: { label: '拼团活动', tagType: 'success' },
  slash: { label: '砍价活动', tagType: 'danger' },
  lottery: { label: '抽奖转盘', tagType: '' },
  flash_sale: { label: '限时商品', tagType: 'warning' },
  coupon_center: { label: '优惠券中心', tagType: 'success' },
  page: { label: '小程序页面', tagType: 'info' },
  url: { label: '外部链接', tagType: 'info' }
}

export const bannerPositionMap = {
  home: '首页轮播',
  home_mid: '首页中部',
  home_bottom: '首页底部',
  category: '分类页',
  activity: '活动页'
}
