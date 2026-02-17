const { Theme, QuickEntry, Banner, AppConfig } = require('../models');
const { Op } = require('sequelize');

/**
 * 获取所有主题列表
 */
const getThemes = async (req, res) => {
    try {
        const themes = await Theme.findAll({
            where: { status: 1 },
            order: [['is_active', 'DESC'], ['id', 'ASC']]
        });

        res.json({
            code: 0,
            data: themes
        });
    } catch (error) {
        console.error('获取主题列表失败:', error);
        res.status(500).json({ code: -1, message: '获取主题列表失败' });
    }
};

/**
 * 获取当前激活主题
 */
const getActiveTheme = async (req, res) => {
    try {
        const theme = await Theme.findOne({
            where: {
                is_active: true,
                status: 1
            }
        });

        if (!theme) {
            return res.json({
                code: 0,
                data: {
                    theme_key: 'default',
                    theme_name: '默认主题'
                }
            });
        }

        res.json({
            code: 0,
            data: theme
        });
    } catch (error) {
        console.error('获取当前主题失败:', error);
        res.status(500).json({ code: -1, message: '获取当前主题失败' });
    }
};

/**
 * 切换主题（管理员操作）
 */
const switchTheme = async (req, res) => {
    try {
        const { theme_key } = req.body;

        if (!theme_key) {
            return res.status(400).json({ code: -1, message: '主题标识不能为空' });
        }

        // 查找目标主题
        const targetTheme = await Theme.findOne({
            where: { theme_key, status: 1 }
        });

        if (!targetTheme) {
            return res.status(404).json({ code: -1, message: '主题不存在' });
        }

        // 取消所有主题的激活状态
        await Theme.update(
            { is_active: false },
            { where: { is_active: true } }
        );

        // 激活目标主题
        await targetTheme.update({ is_active: true });

        // 应用主题配置
        await applyThemeConfig(targetTheme);

        res.json({
            code: 0,
            message: '主题切换成功',
            data: targetTheme
        });
    } catch (error) {
        console.error('切换主题失败:', error);
        res.status(500).json({ code: -1, message: '切换主题失败' });
    }
};

/**
 * 应用主题配置到系统
 */
async function applyThemeConfig(theme) {
    try {
        // 更新主色调配置
        if (theme.primary_color) {
            await AppConfig.upsert({
                config_key: 'primary_color',
                config_value: theme.primary_color,
                config_type: 'string',
                category: 'ui',
                is_public: true,
                status: 1
            });
        }

        // 更新轮播图
        if (theme.banner_images && Array.isArray(theme.banner_images)) {
            // 先禁用所有轮播图
            await Banner.update(
                { status: 0 },
                { where: { position: 'home' } }
            );

            // 添加或更新主题轮播图
            for (const banner of theme.banner_images) {
                await Banner.upsert({
                    ...banner,
                    position: 'home',
                    status: 1
                });
            }
        }

        // 更新快捷入口
        if (theme.quick_entries && Array.isArray(theme.quick_entries)) {
            // 先禁用所有快捷入口
            await QuickEntry.update(
                { status: 0 },
                { where: { position: 'home' } }
            );

            // 添加或更新主题快捷入口
            for (const entry of theme.quick_entries) {
                await QuickEntry.upsert({
                    ...entry,
                    position: 'home',
                    status: 1
                });
            }
        }

        console.log(`主题 ${theme.theme_name} 配置已应用`);
    } catch (error) {
        console.error('应用主题配置失败:', error);
        throw error;
    }
}

/**
 * 创建主题
 */
const createTheme = async (req, res) => {
    try {
        const themeData = req.body;

        const theme = await Theme.create(themeData);

        res.json({
            code: 0,
            message: '创建主题成功',
            data: theme
        });
    } catch (error) {
        console.error('创建主题失败:', error);
        res.status(500).json({ code: -1, message: '创建主题失败' });
    }
};

/**
 * 更新主题
 */
const updateTheme = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const theme = await Theme.findByPk(id);
        if (!theme) {
            return res.status(404).json({ code: -1, message: '主题不存在' });
        }

        await theme.update(updateData);

        res.json({
            code: 0,
            message: '更新主题成功',
            data: theme
        });
    } catch (error) {
        console.error('更新主题失败:', error);
        res.status(500).json({ code: -1, message: '更新主题失败' });
    }
};

/**
 * 删除主题
 */
const deleteTheme = async (req, res) => {
    try {
        const { id } = req.params;

        const theme = await Theme.findByPk(id);
        if (!theme) {
            return res.status(404).json({ code: -1, message: '主题不存在' });
        }

        if (theme.is_active) {
            return res.status(400).json({ code: -1, message: '不能删除当前激活的主题' });
        }

        await theme.update({ status: 0 });

        res.json({
            code: 0,
            message: '删除主题成功'
        });
    } catch (error) {
        console.error('删除主题失败:', error);
        res.status(500).json({ code: -1, message: '删除主题失败' });
    }
};

/**
 * 自动检查并切换主题（定时任务调用）
 */
const autoSwitchTheme = async () => {
    try {
        const today = new Date();
        const monthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        // 查找应该在今天激活的主题
        const theme = await Theme.findOne({
            where: {
                auto_start_date: { [Op.lte]: monthDay },
                auto_end_date: { [Op.gte]: monthDay },
                status: 1
            },
            order: [['auto_start_date', 'DESC']]
        });

        if (theme && !theme.is_active) {
            console.log(`自动切换到主题: ${theme.theme_name}`);

            // 取消所有主题的激活状态
            await Theme.update(
                { is_active: false },
                { where: { is_active: true } }
            );

            // 激活目标主题
            await theme.update({ is_active: true });
            await applyThemeConfig(theme);
        }
    } catch (error) {
        console.error('自动切换主题失败:', error);
    }
};

module.exports = {
    getThemes,
    getActiveTheme,
    switchTheme,
    createTheme,
    updateTheme,
    deleteTheme,
    autoSwitchTheme
};
