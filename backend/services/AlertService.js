/**
 * AlertService - 钉钉 / 企业微信 Webhook 告警推送服务
 *
 * 配置存储在 SystemConfig 表，config_group = 'notification'
 * 键名：
 *   alert_enabled              - boolean  总开关
 *   alert_webhook_type         - string   dingtalk | wecom | both
 *   alert_dingtalk_webhook     - string   钉钉机器人 Webhook URL
 *   alert_wecom_webhook        - string   企业微信机器人 Webhook URL
 *   alert_min_interval_minutes - number   同类告警最小推送间隔（分钟，默认 10）
 */

const https = require('https');
const http  = require('http');
const { URL } = require('url');

// 内存冷却：Map<alertKey, lastSentTimestamp>
const cooldownMap = new Map();

/**
 * 从 SystemConfig 读取告警配置（不走 ConfigService 缓存以保证实时性）
 */
async function loadAlertConfig() {
    try {
        const { SystemConfig } = require('../models');
        const rows = await SystemConfig.findAll({
            where: { config_group: 'notification' }
        });
        const cfg = {};
        rows.forEach(r => {
            let v = r.config_value;
            if (r.config_type === 'boolean') v = (v === 'true');
            if (r.config_type === 'number')  v = Number(v);
            cfg[r.config_key] = v;
        });
        return cfg;
    } catch (e) {
        return {};
    }
}

/**
 * 发送 HTTP(S) POST，返回 Promise<{ ok, status, body }>
 */
function httpPost(urlStr, payload) {
    return new Promise((resolve) => {
        let parsed;
        try { parsed = new URL(urlStr); } catch {
            return resolve({ ok: false, status: 0, body: 'invalid url' });
        }
        const data = JSON.stringify(payload);
        const opts = {
            hostname: parsed.hostname,
            port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
            path:     parsed.pathname + parsed.search,
            method:   'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };
        const lib = parsed.protocol === 'https:' ? https : http;
        const req = lib.request(opts, (res) => {
            let body = '';
            res.on('data', d => { body += d; });
            res.on('end', () => resolve({ ok: res.statusCode < 300, status: res.statusCode, body }));
        });
        req.on('error', (err) => resolve({ ok: false, status: 0, body: err.message }));
        req.setTimeout(8000, () => { req.destroy(); resolve({ ok: false, status: 0, body: 'timeout' }); });
        req.write(data);
        req.end();
    });
}

/**
 * 构造钉钉 Markdown 消息体
 */
function buildDingTalkPayload(title, content, level = 'warning') {
    const levelPrefix = level === 'critical' ? '🚨' : level === 'error' ? '❌' : '⚠️';
    return {
        msgtype: 'markdown',
        markdown: {
            title: `${levelPrefix} ${title}`,
            text: `## ${levelPrefix} ${title}\n\n${content}\n\n> 来源：运维监控系统`
        }
    };
}

/**
 * 构造企业微信 Markdown 消息体
 */
function buildWeComPayload(title, content, level = 'warning') {
    const levelPrefix = level === 'critical' ? '🚨' : level === 'error' ? '❌' : '⚠️';
    return {
        msgtype: 'markdown',
        markdown: {
            content: `## ${levelPrefix} ${title}\n${content}\n> 来源：运维监控系统`
        }
    };
}

/**
 * 发送单条告警到指定 Webhook
 * @param {'dingtalk'|'wecom'} type
 * @param {string} url
 * @param {string} title
 * @param {string} content
 * @param {string} level  'warning' | 'error' | 'critical'
 */
async function sendToWebhook(type, url, title, content, level) {
    const payload = type === 'dingtalk'
        ? buildDingTalkPayload(title, content, level)
        : buildWeComPayload(title, content, level);
    const result = await httpPost(url, payload);
    return result;
}

/**
 * 主推送函数
 * @param {string} title      告警标题
 * @param {string} content    告警正文（Markdown）
 * @param {string} [level]    'warning' | 'error' | 'critical'
 * @param {string} [alertKey] 用于冷却判断的 key（默认取 title）
 */
async function send(title, content, level = 'warning', alertKey = null) {
    const cfg = await loadAlertConfig();

    if (!cfg.alert_enabled) return { sent: false, reason: 'disabled' };

    const key = alertKey || title;
    const minIntervalMs = ((cfg.alert_min_interval_minutes ?? 10)) * 60 * 1000;
    const last = cooldownMap.get(key) || 0;
    if (Date.now() - last < minIntervalMs) {
        return { sent: false, reason: 'cooldown' };
    }

    const type   = cfg.alert_webhook_type  || 'dingtalk';
    const dtUrl  = cfg.alert_dingtalk_webhook || '';
    const wcUrl  = cfg.alert_wecom_webhook    || '';

    const tasks = [];
    if ((type === 'dingtalk' || type === 'both') && dtUrl) {
        tasks.push(sendToWebhook('dingtalk', dtUrl, title, content, level).then(r => ({ channel: 'dingtalk', ...r })));
    }
    if ((type === 'wecom' || type === 'both') && wcUrl) {
        tasks.push(sendToWebhook('wecom', wcUrl, title, content, level).then(r => ({ channel: 'wecom', ...r })));
    }

    if (tasks.length === 0) return { sent: false, reason: 'no_webhook_configured' };

    const results = await Promise.all(tasks);
    const anyOk = results.some(r => r.ok);
    if (anyOk) cooldownMap.set(key, Date.now());

    return { sent: true, results };
}

/**
 * 测试 Webhook 连通性（管理后台测试按钮用）
 * @param {'dingtalk'|'wecom'} type
 * @param {string} url
 */
async function testWebhook(type, url) {
    if (!url) return { ok: false, message: 'Webhook 地址不能为空' };
    const result = await sendToWebhook(type, url, '测试告警', '这是一条来自运维监控系统的**测试消息**，请忽略。', 'warning');
    return {
        ok: result.ok,
        status: result.status,
        message: result.ok ? '发送成功' : `发送失败: ${result.body}`
    };
}

module.exports = { send, testWebhook, loadAlertConfig };
