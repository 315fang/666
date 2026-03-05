const { HomeSection } = require('../../../models');
const { clearHomepageCache } = require('../../../controllers/configController');

/**
 * 支持的区块类型与配置 Schema
 * 每种 type 对应前端一个独立组件渲染
 */
const SECTION_SCHEMAS = {
    banner: {
        label: '轮播图 / 海报',
        icon: '🖼️',
        configSchema: {
            images: { type: 'array', label: '图片列表（URL数组）', default: [] },
            autoplay: { type: 'boolean', label: '自动播放', default: true },
            interval: { type: 'number', label: '切换间隔(ms)', default: 4000 },
            height: { type: 'string', label: '高度(rpx)', default: '400' },
            borderRadius: { type: 'string', label: '圆角(rpx)', default: '0' }
        }
    },
    'product-grid': {
        label: '商品宫格',
        icon: '🛒',
        configSchema: {
            columns: { type: 'number', label: '列数', default: 2 },
            limit: { type: 'number', label: '显示数量', default: 6 },
            categoryId: { type: 'string', label: '分类 ID（空表示全部）', default: '' },
            showPrice: { type: 'boolean', label: '显示价格', default: true },
            cardStyle: { type: 'select', label: '卡片风格', options: ['card', 'minimal', 'luxury'], default: 'card' }
        }
    },
    'quick-entry': {
        label: '快捷入口',
        icon: '⚡',
        configSchema: {
            columns: { type: 'number', label: '列数', default: 4 },
            style: { type: 'select', label: '风格', options: ['icon-text', 'card', 'pill'], default: 'icon-text' }
        }
    },
    'notice-bar': {
        label: '公告条',
        icon: '📢',
        configSchema: {
            text: { type: 'string', label: '公告内容', default: '欢迎光临我们的小程序！' },
            bgColor: { type: 'color', label: '背景色', default: '#FEF3C7' },
            textColor: { type: 'color', label: '文字色', default: '#92400E' },
            scrollable: { type: 'boolean', label: '滚动播放', default: true },
            icon: { type: 'string', label: '图标', default: '📣' }
        }
    },
    'text-block': {
        label: '图文区块',
        icon: '📝',
        configSchema: {
            title: { type: 'string', label: '标题', default: '' },
            titleEn: { type: 'string', label: '英文副标题', default: '' },
            body: { type: 'textarea', label: '正文', default: '' },
            image: { type: 'string', label: '配图 URL', default: '' },
            layout: { type: 'select', label: '布局', options: ['text-only', 'image-left', 'image-right', 'image-top'], default: 'text-only' },
            bgColor: { type: 'color', label: '背景色', default: '#FFFFFF' }
        }
    },
    countdown: {
        label: '倒计时活动',
        icon: '⏰',
        configSchema: {
            title: { type: 'string', label: '活动名称', default: '限时秒杀' },
            endTime: { type: 'datetime', label: '结束时间', default: '' },
            bgColor: { type: 'color', label: '背景色', default: '#1C1917' },
            textColor: { type: 'color', label: '文字色', default: '#FFFFFF' }
        }
    },
    'feature-cards': {
        label: '特色服务/卡组',
        icon: '🎨',
        configSchema: {
            columns: { type: 'number', label: '列数', default: 2 },
            cards: {
                type: 'array',
                label: '卡片配置',
                default: [],
                itemSchema: {
                    name: { type: 'string', label: '大字标题(name)', default: '' },
                    description: { type: 'string', label: '小字描述(desc)', default: '' },
                    icon_url: { type: 'string', label: '图标URL(支持空)', default: '' },
                    bg_gradient: { type: 'color', label: '背景配置(如渐变色)', default: '#1a1a2e' },
                    tag: { type: 'string', label: '角标标签(tag)', default: '' },
                    link_type: { type: 'select', label: '跳转类型', options: ['page', 'copy', 'miniprogram'], default: 'page' },
                    link_value: { type: 'string', label: '跳转值/链接', default: '' }
                }
            }
        }
    },
    'divider': {
        label: '分隔线 / 间距',
        icon: '—',
        configSchema: {
            height: { type: 'number', label: '间距高度(rpx)', default: 32 },
            showLine: { type: 'boolean', label: '显示分隔线', default: false },
            color: { type: 'color', label: '线条颜色', default: '#E7E5E4' }
        }
    },
    // ★ 以下为新增的魔方图与专场促销大图 (参考美妆版块)
    'magic-cube': {
        label: '魔方橱窗 (类目导航)',
        icon: '🎛️',
        configSchema: {
            style: { type: 'select', label: '排列风格', options: ['1-left-2-right', '1-top-2-bottom', '2-col-grid', 'list-with-button'], default: 'list-with-button' },
            blocks: {
                type: 'array',
                label: '魔方模块配置',
                default: [],
                itemSchema: {
                    mainTitle: { type: 'string', label: '主标题(如:自然底妆)', default: '' },
                    subTitle: { type: 'string', label: '副标题(如:尽享素颜)', default: '' },
                    imageUrl: { type: 'string', label: '展示图 URL', default: '' },
                    actionText: { type: 'string', label: '按钮文字', default: '了解更多' },
                    link: { type: 'string', label: '跳转链接', default: '' },
                    titleColor: { type: 'color', label: '主标题颜色', default: '#333333' }
                }
            }
        }
    },
    'promotion-hero': {
        label: '品牌推介专场 (大面积卡片)',
        icon: '🎁',
        configSchema: {
            themeColor: { type: 'color', label: '主题背景底色', default: '#B19069' },
            bgImageUrl: { type: 'string', label: '全屏大背景图 (可选)', default: '' },
            headerTitle: { type: 'string', label: '英文大标题 (如:MEMBER COURTESY)', default: '' },
            headerSubTitle: { type: 'string', label: '中文主标题 (如:会员臻享)', default: '' },
            items: {
                type: 'array',
                label: '活动卡片配置',
                default: [],
                itemSchema: {
                    cardImageUrl: { type: 'string', label: '卡片主视觉图 URL', default: '' },
                    promoTitle: { type: 'string', label: '促销标题(如:满600元赠)', default: '' },
                    promoSubtitle: { type: 'string', label: '补充文案(如:立即选购)', default: '' },
                    buttonText: { type: 'string', label: '黑色行动按钮文字', default: '立即选购 >' },
                    link: { type: 'string', label: '跳转链接', default: '' }
                }
            }
        }
    }
};

/**
 * 获取所有首页区块
 */
const getHomeSections = async (req, res) => {
    try {
        const sections = await HomeSection.findAll({
            order: [['sort_order', 'DESC'], ['id', 'ASC']]
        });
        res.json({ code: 0, data: sections });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 获取区块类型 Schema（预览器使用）
 */
const getSectionSchemas = async (req, res) => {
    res.json({ code: 0, data: SECTION_SCHEMAS });
};

/**
 * 新建区块
 */
const createHomeSection = async (req, res) => {
    try {
        const { section_key, section_name, section_type, title, subtitle, config, sort_order } = req.body;

        if (!section_key || !section_name || !section_type) {
            return res.status(400).json({ code: -1, message: 'section_key / section_name / section_type 必填' });
        }

        if (!SECTION_SCHEMAS[section_type]) {
            return res.status(400).json({
                code: -1,
                message: `不支持的区块类型，可选如下: ${Object.keys(SECTION_SCHEMAS).join(', ')}`
            });
        }

        // 如果 config 为空，用 Schema 默认値充填
        let finalConfig = config || {};
        const schema = SECTION_SCHEMAS[section_type].configSchema;
        Object.keys(schema).forEach(key => {
            if (finalConfig[key] === undefined) {
                finalConfig[key] = schema[key].default;
            }
        });

        const section = await HomeSection.create({
            section_key,
            section_name,
            section_type,
            title: title || '',
            subtitle: subtitle || '',
            config: finalConfig,
            sort_order: sort_order || 0,
            is_visible: true,
            status: 1
        });

        // ★ 清除缓存
        clearHomepageCache();

        res.json({ code: 0, message: '建立成功', data: section });
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({ code: -1, message: 'section_key 已存在' });
        }
        console.error(error);
        res.status(500).json({ code: -1, message: '创建失败' });
    }
};

/**
 * 更新区块配置
 */
const updateHomeSection = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, subtitle, is_visible, sort_order, config, section_name } = req.body;

        const section = await HomeSection.findByPk(id);
        if (!section) return res.status(404).json({ code: -1, message: '区块不存在' });

        await section.update({ title, subtitle, is_visible, sort_order, config, section_name });
        // ★ 清除缓存
        clearHomepageCache();
        res.json({ code: 0, message: '更新成功', data: section });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

/**
 * 切换区块显示/隐藏
 */
const toggleSectionVisible = async (req, res) => {
    try {
        const { id } = req.params;
        const section = await HomeSection.findByPk(id);
        if (!section) return res.status(404).json({ code: -1, message: '区块不存在' });
        await section.update({ is_visible: !section.is_visible });
        // ★ 清除缓存
        clearHomepageCache();
        res.json({ code: 0, message: section.is_visible ? '已显示' : '已隐藏', data: { is_visible: section.is_visible } });
    } catch (error) {
        res.status(500).json({ code: -1, message: '操作失败' });
    }
};

/**
 * 删除区块（软删除）
 */
const deleteHomeSection = async (req, res) => {
    try {
        const { id } = req.params;
        const section = await HomeSection.findByPk(id);
        if (!section) return res.status(404).json({ code: -1, message: '区块不存在' });
        await section.update({ status: 0 });
        // ★ 清除缓存
        clearHomepageCache();

        res.json({ code: 0, message: '已删除' });
    } catch (error) {
        res.status(500).json({ code: -1, message: '删除失败' });
    }
};

/**
 * 批量更新排序
 */
const updateSortOrder = async (req, res) => {
    try {
        const { orders } = req.body;
        await Promise.all(orders.map(item =>
            HomeSection.update({ sort_order: item.sort_order }, { where: { id: item.id } })
        ));
        // ★ 清除缓存
        clearHomepageCache();

        res.json({ code: 0, message: '排序更新成功' });
    } catch (error) {
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

module.exports = {
    SECTION_SCHEMAS,
    getHomeSections,
    getSectionSchemas,
    createHomeSection,
    updateHomeSection,
    toggleSectionVisible,
    deleteHomeSection,
    updateSortOrder
};
