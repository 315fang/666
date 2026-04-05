// backend/controllers/splashController.js
const { SplashScreen } = require('../models');

// 默认配置（首次获取时用于初始化）
const DEFAULT_CONFIG = {
    id: 1,
    is_active: false,
    show_mode: 'always',
    image_url: null,
    title: '盒美美',
    subtitle: '做大学生的第一款护肤品',
    credit: '问兰药业 × 镜像案例库 · 联合出品',
    en_title: 'HEMEIMEI',
    bg_color_start: '#26064F',
    bg_color_end: '#F7F4EF',
    duration: 5000,
    skip_text: '跳过',
    layers: [
        {
            type: 'single',
            title: '问兰药业',
            tag: '苏州河海大学企业',
            lines: ['50年药研传承', '美容院原料供应商'],
            en: 'WENLAN PHARMACEUTICAL'
        },
        {
            type: 'single',
            title: '镜像案例库',
            tag: '大学生成长平台',
            lines: ['社会第一课', '学校最后一堂课'],
            en: 'JINGXIANG CASE LIBRARY'
        }
    ]
};

/**
 * GET /api/splash/active
 * 小程序端：获取当前激活的开屏动画配置
 * 仅当 is_active=true 时返回配置，否则返回 disabled
 */
exports.getActive = async (req, res, next) => {
    try {
        let config = await SplashScreen.findOne({ where: { id: 1 } });
        if (!config) {
            return res.json({ code: 0, data: { is_active: false, show_mode: 'disabled' } });
        }
        if (!config.is_active) {
            return res.json({ code: 0, data: { is_active: false, show_mode: 'disabled' } });
        }
        res.json({ code: 0, data: config });
    } catch (err) {
        next(err);
    }
};

/**
 * GET /admin/api/splash
 * 管理端：获取开屏动画配置（没有则返回默认）
 */
exports.getConfig = async (req, res, next) => {
    try {
        let config = await SplashScreen.findOne({ where: { id: 1 } });
        if (!config) {
            // 返回默认，但不写入数据库（懒初始化，保存时才创建）
            return res.json({ code: 0, data: DEFAULT_CONFIG });
        }
        res.json({ code: 0, data: config });
    } catch (err) {
        next(err);
    }
};

/**
 * PUT /admin/api/splash
 * 管理端：保存开屏动画配置（upsert，id=1）
 */
exports.updateConfig = async (req, res, next) => {
    try {
        const {
            is_active,
            show_mode,
            image_url,
            title,
            subtitle,
            credit,
            en_title,
            bg_color_start,
            bg_color_end,
            duration,
            skip_text,
            layers
        } = req.body;

        // 校验 show_mode
        const validModes = ['always', 'daily', 'once', 'disabled'];
        if (show_mode && !validModes.includes(show_mode)) {
            return res.status(400).json({ code: -1, message: 'show_mode 无效' });
        }

        const updateData = {};
        if (is_active !== undefined) updateData.is_active = Boolean(is_active);
        if (show_mode) updateData.show_mode = show_mode;
        if (image_url !== undefined) updateData.image_url = image_url || null;
        if (title) updateData.title = title;
        if (subtitle !== undefined) updateData.subtitle = subtitle;
        if (credit !== undefined) updateData.credit = credit;
        if (en_title !== undefined) updateData.en_title = en_title;
        if (bg_color_start) updateData.bg_color_start = bg_color_start;
        if (bg_color_end) updateData.bg_color_end = bg_color_end;
        if (duration !== undefined) updateData.duration = Number(duration) || 5000;
        if (skip_text !== undefined) updateData.skip_text = skip_text;
        if (layers !== undefined) updateData.layers = layers;

        const [config, created] = await SplashScreen.upsert(
            { id: 1, ...DEFAULT_CONFIG, ...updateData },
            { returning: true }
        );

        res.json({ code: 0, data: config, message: created ? '配置已创建' : '配置已更新' });
    } catch (err) {
        next(err);
    }
};
