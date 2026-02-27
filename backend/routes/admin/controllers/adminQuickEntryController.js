const { QuickEntry } = require('../../../models');

const getEntries = async (req, res) => {
    try {
        const entries = await QuickEntry.findAll({
            order: [['sort_order', 'DESC']]
        });
        res.json({ code: 0, data: entries });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: -1, message: '获取失败' });
    }
};

const createEntry = async (req, res) => {
    try {
        const data = req.body;
        const entry = await QuickEntry.create(data);
        res.json({ code: 0, data: entry, message: '创建成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: -1, message: '创建失败' });
    }
};

const updateEntry = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        const entry = await QuickEntry.findByPk(id);
        if (!entry) return res.status(404).json({ code: -1, message: '数据不存在' });
        await entry.update(data);
        res.json({ code: 0, message: '更新成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: -1, message: '更新失败' });
    }
};

const deleteEntry = async (req, res) => {
    try {
        const { id } = req.params;
        await QuickEntry.destroy({ where: { id } });
        res.json({ code: 0, message: '删除成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ code: -1, message: '删除失败' });
    }
};

module.exports = {
    getEntries,
    createEntry,
    updateEntry,
    deleteEntry
};
