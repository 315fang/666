const { Address } = require('../models');

/**
 * 获取地址列表
 */
async function getAddresses(req, res, next) {
    try {
        const user = req.user;

        const addresses = await Address.findAll({
            where: { user_id: user.id },
            order: [['is_default', 'DESC'], ['created_at', 'DESC']]
        });

        res.json({
            success: true,
            list: addresses
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 创建地址
 */
async function createAddress(req, res, next) {
    try {
        const user = req.user;
        const { receiver_name, phone, province, city, district, detail, is_default } = req.body;

        if (!receiver_name || !phone || !detail) {
            return res.status(400).json({
                success: false,
                message: '收货人、电话和详细地址不能为空'
            });
        }

        // 如果设置为默认，先取消其他默认地址
        if (is_default) {
            await Address.update(
                { is_default: 0 },
                { where: { user_id: user.id } }
            );
        }

        const address = await Address.create({
            user_id: user.id,
            receiver_name,
            phone,
            province,
            city,
            district,
            detail,
            is_default: is_default ? 1 : 0
        });

        res.json({
            success: true,
            data: address
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 更新地址
 */
async function updateAddress(req, res, next) {
    try {
        const { id } = req.params;
        const user = req.user;
        const { receiver_name, phone, province, city, district, detail, is_default } = req.body;

        const address = await Address.findOne({
            where: { id, user_id: user.id }
        });

        if (!address) {
            return res.status(404).json({
                success: false,
                message: '地址不存在'
            });
        }

        // 如果设置为默认，先取消其他默认地址
        if (is_default) {
            await Address.update(
                { is_default: 0 },
                { where: { user_id: user.id } }
            );
        }

        await address.update({
            receiver_name,
            phone,
            province,
            city,
            district,
            detail,
            is_default: is_default ? 1 : 0
        });

        res.json({
            success: true,
            data: address
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 删除地址
 */
async function deleteAddress(req, res, next) {
    try {
        const { id } = req.params;
        const user = req.user;

        const address = await Address.findOne({
            where: { id, user_id: user.id }
        });

        if (!address) {
            return res.status(404).json({
                success: false,
                message: '地址不存在'
            });
        }

        await address.destroy();

        res.json({
            success: true,
            message: '删除成功'
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 设置默认地址
 */
async function setDefaultAddress(req, res, next) {
    try {
        const { id } = req.params;
        const user = req.user;

        const address = await Address.findOne({
            where: { id, user_id: user.id }
        });

        if (!address) {
            return res.status(404).json({
                success: false,
                message: '地址不存在'
            });
        }

        // 取消其他默认地址
        await Address.update(
            { is_default: 0 },
            { where: { user_id: user.id } }
        );

        // 设置当前为默认
        await address.update({ is_default: 1 });

        res.json({
            success: true,
            message: '设置成功'
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getAddresses,
    createAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress
};
