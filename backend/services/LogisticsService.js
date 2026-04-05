// backend/services/LogisticsService.js
/**
 * 物流查询服务
 *
 * 技术方案：
 * - 主要 API：阿里云物流查询（阿里云市场 API）
 * - 缓存策略：内存 + 文件双层缓存，2h 有效
 * - 用户策略：用户未点查询时持续缓存，用户主动刷新则清除缓存
 * - 支持快递公司：顺丰/圆通/申通/中通/韵达/菜鸟/EMS/京东/极兔等
 *
 * 实际接入步骤：
 * 1. 在阿里云市场购买「快递鸟」或「快递100」API
 * 2. 配置 .env: LOGISTICS_API_KEY, LOGISTICS_CUSTOMER_ID
 * 3. 若使用快递鸟接口，RSIGN = MD5(RequestData+EBusinessID+ApiKey)
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

// ── 缓存目录 ──
const CACHE_DIR = path.join(__dirname, '../cache/logistics');
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2小时
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// ── 内存缓存（避免重复读磁盘）──
const _memCache = new Map();

// 快递公司 code 映射（对照阿里云文档 type 缩写列，见 物流.md）
// key = 订单表里存的 logistics_company 值，value = 阿里云 API type 参数
const COMPANY_DISPLAY_MAP = {
    SF: '顺丰速运',
    STO: '申通快递',
    ZTO: '中通快递',
    YTO: '圆通速递',
    YD: '韵达快递',
    EMS: '邮政 EMS',
    CHINAPOST: '中国邮政',
    JD: '京东物流',
    HTKY: '百世快递',
    JTSD: '极兔速递',
    CNSD: '菜鸟速运',
    DEPPON: '德邦物流',
    ANE: '安能物流',
    ZJS: '宅急送',
    GTO: '国通快递',
    DHL: 'DHL',
    FEDEX: 'FedEx',
    UPS: 'UPS',
    TNT: 'TNT'
};

const COMPANY_ALIAS_MAP = {
    AUTO: 'AUTO',
    auto: 'AUTO',
    自动: 'AUTO',
    SF: 'SF',
    SFEXPRESS: 'SF',
    顺丰: 'SF',
    顺丰速运: 'SF',
    STO: 'STO',
    申通: 'STO',
    申通快递: 'STO',
    ZTO: 'ZTO',
    中通: 'ZTO',
    中通快递: 'ZTO',
    YTO: 'YTO',
    圆通: 'YTO',
    圆通速递: 'YTO',
    YD: 'YD',
    YUNDA: 'YD',
    YUNDA56: 'YD',
    韵达: 'YD',
    韵达快递: 'YD',
    韵达速递: 'YD',
    EMS: 'EMS',
    邮政EMS: 'EMS',
    中国邮政EMS: 'EMS',
    CHINAPOST: 'CHINAPOST',
    邮政: 'CHINAPOST',
    中国邮政: 'CHINAPOST',
    JD: 'JD',
    京东: 'JD',
    京东快递: 'JD',
    京东物流: 'JD',
    HTKY: 'HTKY',
    BEST: 'HTKY',
    百世: 'HTKY',
    百世快递: 'HTKY',
    JTSD: 'JTSD',
    JITU: 'JTSD',
    极兔: 'JTSD',
    极兔速递: 'JTSD',
    CNSD: 'CNSD',
    CAINIAO: 'CNSD',
    菜鸟: 'CNSD',
    菜鸟速运: 'CNSD',
    DEPPON: 'DEPPON',
    德邦: 'DEPPON',
    德邦快递: 'DEPPON',
    德邦物流: 'DEPPON',
    ANE: 'ANE',
    安能: 'ANE',
    安能物流: 'ANE',
    ZJS: 'ZJS',
    宅急送: 'ZJS',
    GTO: 'GTO',
    国通: 'GTO',
    国通快递: 'GTO',
    DHL: 'DHL',
    FEDEX: 'FEDEX',
    UPS: 'UPS',
    TNT: 'TNT'
};

const COMPANY_CODE_MAP = {
    // 国内主流
    SF: 'SFEXPRESS',     // 顺丰速运
    STO: 'STO',          // 申通快递
    ZTO: 'ZTO',          // 中通快递
    YTO: 'YTO',          // 圆通速递
    YD: 'YUNDA',         // 韵达快递
    YUNDA: 'YUNDA',      // 韵达快递
    YUNDA56: 'YUNDA56',  // 韵达快运
    EMS: 'EMS',          // 中国邮政EMS
    CHINAPOST: 'CHINAPOST', // 邮政包裹
    JD: 'JD',            // 京东快递
    HTKY: 'HTKY',        // 百世快递
    JTSD: 'JITU',        // 极兔速递
    JITU: 'JITU',        // 极兔速递
    CNSD: 'CAINIAO',     // 菜鸟快递
    CAINIAO: 'CAINIAO',  // 菜鸟快递
    DEPPON: 'DEPPON',    // 德邦快递
    ANE: 'ANE',          // 安能快递
    ZJS: 'ZJS',          // 宅急送
    GTO: 'GTO',          // 国通快递
    BEST: 'HTKY',        // 百世（别名）
    // 国际
    DHL: 'DHL',
    FEDEX: 'FEDEX',
    UPS: 'UPS',
    TNT: 'TNT',
};

function normalizeCompanyCode(companyCode = '') {
    const rawValue = String(companyCode || '').trim();
    if (!rawValue) return '';

    const upperValue = rawValue.toUpperCase();
    return COMPANY_ALIAS_MAP[rawValue] || COMPANY_ALIAS_MAP[upperValue] || upperValue;
}

function getCompanyDisplayName(companyCode = '') {
    const normalizedCode = normalizeCompanyCode(companyCode);
    return COMPANY_DISPLAY_MAP[normalizedCode] || normalizedCode;
}

/**
 * 查询物流轨迹
 * @param {string} trackingNo  - 运单号
 * @param {string} companyCode - 物流公司代码（如 SF/YTO/ZTO 等）
 * @param {boolean} forceRefresh - 是否强制刷新缓存（用户主动刷新时传 true）
 * @returns {Promise<object>}  - { company, tracking_no, status, traces[] }
 */
async function queryLogistics(trackingNo, companyCode = 'auto', forceRefresh = false) {
    const normalizedCompanyCode = normalizeCompanyCode(companyCode) || 'AUTO';
    const cacheKey = `${normalizedCompanyCode}:${trackingNo}`;

    // ── 检查缓存（不强制刷新时）──
    if (!forceRefresh) {
        const cached = _getCache(cacheKey);
        if (cached) {
            return { ...cached, fromCache: true };
        }
    }

    // ── 调用阿里云 API ──
    try {
        const result = await _callAliyunApi(trackingNo, normalizedCompanyCode);
        _setCache(cacheKey, result);
        return { ...result, fromCache: false };
    } catch (err) {
        // API 调用失败时尝试返回过期缓存（降级策略）
        const staleCache = _getCache(cacheKey, true);
        if (staleCache) {
            return { ...staleCache, fromCache: true, stale: true, error: err.message };
        }
        throw err;
    }
}

/**
 * 阿里云物流 API 调用（APPCODE 认证）
 * 文档：https://market.aliyun.com/products/56928004/cmapi021863.html
 */
function _callAliyunApi(trackingNo, companyCode) {
    return new Promise((resolve, reject) => {
        const apiKey = process.env.LOGISTICS_API_KEY || '';
        const host = 'wuliu.market.alicloudapi.com';

        // 如果没配置 API Key，返回 mock 数据（开发环境用）
        if (!apiKey) {
            console.warn('[Logistics] LOGISTICS_API_KEY 未配置，返回 mock 数据');
            return resolve(_getMockData(trackingNo, companyCode));
        }

        // 将内部 code 转换为阿里云 type 参数（不区分大小写，转小写发送）
        const upperCode = normalizeCompanyCode(companyCode);
        const aliType = (COMPANY_CODE_MAP[upperCode] || (upperCode !== 'AUTO' ? upperCode : ''));
        const typeParam = aliType ? `&type=${aliType.toLowerCase()}` : '';

        const reqPath = `/kdi?no=${encodeURIComponent(trackingNo)}${typeParam}`;

        const options = {
            hostname: host,
            path: reqPath,
            method: 'GET',
            headers: {
                'Authorization': `APPCODE ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        };

        console.log(`[Logistics] 查询: ${trackingNo}${aliType ? ` (${upperCode}/${aliType})` : ' (自动识别)'}`);

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.status === '0') {
                        resolve(_parseAliyunResponse(json, trackingNo, companyCode));
                    } else {
                        reject(new Error(`API错误: ${json.msg || '未知错误'} (status=${json.status})`));
                    }
                } catch (e) {
                    reject(new Error(`JSON解析失败: ${e.message}`));
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
        req.end();
    });
}

function _parseAliyunResponse(json, trackingNo, companyCode) {
    const data = json.result || {};
    const traces = (data.list || []).map(item => ({
        time: item.time,
        desc: item.status,
        location: ''
    })).reverse(); // 最新的在前

    return {
        company: data.expName || getCompanyDisplayName(companyCode) || companyCode,
        company_type: data.type || '',
        tracking_no: data.number || trackingNo,
        status: _mapStatus(data.deliverystatus),
        status_text: _mapStatusText(data.deliverystatus),
        courier: data.courier || '',
        courier_phone: data.courierPhone || '',
        update_time: data.updateTime || '',
        take_time: data.takeTime || '',
        traces,
        query_time: new Date().toISOString()
    };
}

function _mapStatus(deliverystatus) {
    const map = {
        '0': 'collecting',
        '1': 'in_transit',
        '2': 'dispatching',
        '3': 'delivered',
        '4': 'failed',
        '5': 'problem',
        '6': 'returned'
    };
    return map[String(deliverystatus)] || 'unknown';
}

function _mapStatusText(deliverystatus) {
    const map = {
        '0': '快递收件(揽件)',
        '1': '在途中',
        '2': '正在派件',
        '3': '已签收',
        '4': '派送失败',
        '5': '疑难件',
        '6': '退件签收'
    };
    return map[String(deliverystatus)] || '未知状态';
}

// ── Mock 数据（开发/测试用）──
function _getMockData(trackingNo, companyCode) {
    const now = new Date();
    return {
        company: getCompanyDisplayName(companyCode) || '顺丰速运',
        tracking_no: trackingNo,
        status: 'in_transit',
        status_text: '运输中',
        traces: [
            { time: new Date(now - 1 * 3600000).toISOString(), desc: '快件已到达【北京转运中心】', location: '北京' },
            { time: new Date(now - 3 * 3600000).toISOString(), desc: '快件已离开【上海浦东分拣中心】', location: '上海' },
            { time: new Date(now - 6 * 3600000).toISOString(), desc: '快件已揽收', location: '上海' }
        ],
        query_time: now.toISOString(),
        is_mock: true
    };
}

// ── 缓存操作 ──
function _getCacheFile(key) {
    return path.join(CACHE_DIR, `${key.replace(/[:/]/g, '_')}.json`);
}

function _getCache(key, allowStale = false) {
    // 先查内存
    if (_memCache.has(key)) {
        const { data, expireAt } = _memCache.get(key);
        if (allowStale || Date.now() < expireAt) return data;
        _memCache.delete(key);
    }
    // 再查文件
    const file = _getCacheFile(key);
    try {
        if (!fs.existsSync(file)) return null;
        const { data, expireAt } = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (allowStale || Date.now() < expireAt) {
            _memCache.set(key, { data, expireAt }); // 回存内存
            return data;
        }
        fs.unlinkSync(file); // 过期清理
    } catch { /* 文件读取失败忽略 */ }
    return null;
}

function _setCache(key, data) {
    const expireAt = Date.now() + CACHE_TTL_MS;
    _memCache.set(key, { data, expireAt });
    const file = _getCacheFile(key);
    try {
        fs.writeFileSync(file, JSON.stringify({ data, expireAt }), 'utf8');
    } catch { /* 磁盘写入失败忽略（降级为仅内存缓存）*/ }
}

/**
 * 清除指定运单缓存（用户主动刷新时调用）
 */
function clearCache(trackingNo, companyCode = '') {
    const normalizedCompanyCode = normalizeCompanyCode(companyCode) || '';
    const key = `${normalizedCompanyCode}:${trackingNo}`;
    _memCache.delete(key);
    const file = _getCacheFile(key);
    if (fs.existsSync(file)) fs.unlinkSync(file);
}

/**
 * 清理所有过期缓存（可定期调用）
 */
function cleanExpiredCache() {
    const now = Date.now();
    // 清内存
    for (const [k, v] of _memCache.entries()) {
        if (now >= v.expireAt) _memCache.delete(k);
    }
    // 清文件
    try {
        fs.readdirSync(CACHE_DIR).forEach(file => {
            const filePath = path.join(CACHE_DIR, file);
            try {
                const { expireAt } = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                if (now >= expireAt) fs.unlinkSync(filePath);
            } catch { fs.unlinkSync(filePath); }
        });
    } catch { /* 忽略 */ }
}

// 每小时清理一次过期缓存
setInterval(cleanExpiredCache, 60 * 60 * 1000);

module.exports = {
    queryLogistics,
    clearCache,
    cleanExpiredCache,
    COMPANY_CODE_MAP,
    normalizeCompanyCode,
    getCompanyDisplayName
};
