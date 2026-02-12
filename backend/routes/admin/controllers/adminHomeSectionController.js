const { HomeSection } = require('../../../../models');

/**
 * 获取所有首页区块
 */
const getHomeSections = async (req, res) => {
    try {
        const sections = await HomeSection.findAll({
            order: [['sort_order', 'DESC']]
        });
        res.json({ code: 0, data: sections });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

/**
 * 更新区块配置
 */
const updateHomeSection = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, subtitle, is_visible, sort_order, config } = req.body;
        
        const section = await HomeSection.findByPk(id);
        if (!section) return res.status(404).json({ code: -1, message: '区块不存在' });

        await section.update({
            title,
            subtitle,
            is_visible,
            sort_order,
            config
        });

        res.json({ code: 0, message: '更新成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

/**
 * 批量更新排序
 */
const updateSortOrder = async (req, res) => {
    try {
        const { orders } = req.body; // [{id: 1, sort_order: 100}, ...]
        
        for (const item of orders) {
            await HomeSection.update(
                { sort_order: item.sort_order },
                { where: { id: item.id } }
            );
        }

        res.json({ code: 0, message: '排序更新成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

module.exports = {
    getHomeSections,
    updateHomeSection,
    updateSortOrder
};
