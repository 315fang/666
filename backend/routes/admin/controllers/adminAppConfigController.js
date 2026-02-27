const { AppConfig } = require('../../../models');

const getConfigs = async (req, res) => {
    try {
        const configs = await AppConfig.findAll({
            order: [['category', 'ASC']]
        });
        res.json({ code: 0, data: configs });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

const createConfig = async (req, res) => {
    try {
        const data = req.body;
        const entry = await AppConfig.create(data);
        res.json({ code: 0, data: entry, message: '创建成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: -1, message: '创建失败' });
    }
};

const updateConfig = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        const entry = await AppConfig.findByPk(id);
        if (!entry) return res.status(404).json({ code: -1, message: '数据不存在' });
        await entry.update(data);
        res.json({ code: 0, message: '更新成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

module.exports = {
    getConfigs,
    createConfig,
    updateConfig
};
