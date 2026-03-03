const { HomeSection } = require('../../../models');

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
        label: '特色卡片区',
        icon: '🎨',
        configSchema: {
            columns: { type: 'number', label: '列数', default: 2 },
            cards: { type: 'json', label: '卡片配置(JSON)', default: [] }
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
