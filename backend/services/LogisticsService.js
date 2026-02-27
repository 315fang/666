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

// 快递公司 code 映射（阿里云物流 API 需要公司编码）
const COMPANY_CODE_MAP = {
    SF: 'shunfeng',    // 顺丰
    YTO: 'yuantong',   // 圆通
    STO: 'shentong',   // 申通
    ZTO: 'zhongtong',  // 中通
    YD: 'yunda',       // 韵达
    EMS: 'ems',
    JD: 'jd',          // 京东
    BEST: 'best',      // 百世
    JTEX: 'jtexpress', // 极兔
    CAINIAO: 'cainiao' // 菜鸟
};

/**
 * 查询物流轨迹
 * @param {string} trackingNo  - 运单号
 * @param {string} companyCode - 物流公司代码（如 SF/YTO/ZTO 等）
 * @param {boolean} forceRefresh - 是否强制刷新缓存（用户主动刷新时传 true）
 * @returns {Promise<object>}  - { company, tracking_no, status, traces[] }
 */
async function queryLogistics(trackingNo, companyCode = 'auto', forceRefresh = false) {
    const cacheKey = `${companyCode}:${trackingNo}`;

    // ── 检查缓存（不强制刷新时）──
    if (!forceRefresh) {
        const cached = _getCache(cacheKey);
        if (cached) {
            return { ...cached, fromCache: true };
        }
    }

    // ── 调用阿里云 API ──
    try {
        const result = await _callAliyunApi(trackingNo, companyCode);
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
 * 阿里云物流 API 调用
 * 文档：https://market.aliyun.com/products/56928004/cmapi011061.html
 */
function _callAliyunApi(trackingNo, companyCode) {
    return new Promise((resolve, reject) => {
        const apiKey = process.env.LOGISTICS_API_KEY || '';
        const host = 'wuliu.market.alicloudapi.com';
        const path = `/kdi?no=${encodeURIComponent(trackingNo)}`;

        // 如果没配置 API Key，返回 mock 数据（开发环境用）
        if (!apiKey) {
            console.warn('[Logistics] LOGISTICS_API_KEY 未配置，返回 mock 数据');
            return resolve(_getMockData(trackingNo, companyCode));
        }

        const options = {
            hostname: host,
            path,
            method: 'GET',
            headers: {
                'Authorization': `APPCODE ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.status === '0') {
                        resolve(_parseAliyunResponse(json, trackingNo, companyCode));
                    } else {
                        reject(new Error(`API错误: ${json.msg || '未知错误'}`));
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
        company: data.expName || companyCode,
        tracking_no: trackingNo,
        status: _mapStatus(data.deliverystatus),
        status_text: data.issign === '1' ? '已签收' : '运输中',
        traces,
        query_time: new Date().toISOString()
    };
}

function _mapStatus(deliverystatus) {
    const map = { '0': 'collecting', '1': 'in_transit', '2': 'dispatching', '3': 'delivered', '4': 'failed' };
    return map[deliverystatus] || 'unknown';
}

// ── Mock 数据（开发/测试用）──
function _getMockData(trackingNo, companyCode) {
    const now = new Date();
    return {
        company: companyCode || 'SF',
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
    const key = `${companyCode}:${trackingNo}`;
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

module.exports = { queryLogistics, clearCache, cleanExpiredCache, COMPANY_CODE_MAP };
