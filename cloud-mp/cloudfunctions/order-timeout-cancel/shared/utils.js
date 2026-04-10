/**
 * cloudfunctions/shared/utils.js
 * 
 * 通用工具函数库
 * 包含类型转换、格式化和数据处理的辅助函数
 */

/**
 * 安全转换为数字
 * @param {*} value - 要转换的值
 * @param {number} defaultValue - 默认值（转换失败时返回）
 * @returns {number} 转换后的数字
 */
function toNumber(value, defaultValue = 0) {
    if (value === null || value === undefined || value === '') {
        return defaultValue;
    }
    const num = Number(value);
    return Number.isNaN(num) ? defaultValue : num;
}

/**
 * 安全转换为数组
 * @param {*} value - 要转换的值
 * @returns {Array} 数组
 */
function toArray(value) {
    if (Array.isArray(value)) {
        return value;
    }
    if (value === null || value === undefined || value === '') {
        return [];
    }
    return [value];
}

/**
 * 安全转换为字符串
 * @param {*} value - 要转换的值
 * @param {string} defaultValue - 默认值
 * @returns {string} 字符串
 */
function toString(value, defaultValue = '') {
    if (value === null || value === undefined) {
        return defaultValue;
    }
    return String(value);
}

/**
 * 安全转换为布尔值
 * @param {*} value - 要转换的值
 * @param {boolean} defaultValue - 默认值
 * @returns {boolean} 布尔值
 */
function toBoolean(value, defaultValue = false) {
    if (value === null || value === undefined) {
        return defaultValue;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    if (typeof value === 'string') {
        const lower = value.toLowerCase();
        return !['false', '0', 'no', 'off', ''].includes(lower);
    }
    return Boolean(value);
}

/**
 * 获取对象的嵌套属性
 * @param {Object} obj - 对象
 * @param {string} path - 属性路径（如 'a.b.c'）
 * @param {*} defaultValue - 默认值
 * @returns {*} 属性值
 */
function getDeep(obj, path, defaultValue = undefined) {
    if (!obj || typeof path !== 'string') {
        return defaultValue;
    }
    
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
        if (current == null) {
            return defaultValue;
        }
        current = current[part];
    }
    
    return current !== undefined ? current : defaultValue;
}

/**
 * 设置对象的嵌套属性
 * @param {Object} obj - 对象
 * @param {string} path - 属性路径（如 'a.b.c'）
 * @param {*} value - 要设置的值
 * @returns {Object} 修改后的对象
 */
function setDeep(obj, path, value) {
    if (!obj || typeof path !== 'string') {
        return obj;
    }
    
    const parts = path.split('.');
    const lastKey = parts.pop();
    let current = obj;
    
    for (const part of parts) {
        if (!(part in current) || typeof current[part] !== 'object') {
            current[part] = {};
        }
        current = current[part];
    }
    
    current[lastKey] = value;
    return obj;
}

/**
 * 深度克隆对象
 * @param {*} obj - 要克隆的对象
 * @returns {*} 克隆后的对象
 */
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }
    
    if (obj instanceof Array) {
        return obj.map(item => deepClone(item));
    }
    
    if (obj instanceof Object) {
        const cloned = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                cloned[key] = deepClone(obj[key]);
            }
        }
        return cloned;
    }
    
    return obj;
}

/**
 * 合并对象（浅合并）
 * @param {Object} target - 目标对象
 * @param {...Object} sources - 源对象
 * @returns {Object} 合并后的对象
 */
function merge(target, ...sources) {
    if (!target) {
        target = {};
    }
    
    for (const source of sources) {
        if (!source || typeof source !== 'object') {
            continue;
        }
        
        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                target[key] = source[key];
            }
        }
    }
    
    return target;
}

/**
 * 过滤对象（仅保留指定键）
 * @param {Object} obj - 对象
 * @param {Array<string>} keys - 要保留的键列表
 * @returns {Object} 过滤后的对象
 */
function pick(obj, keys) {
    if (!obj || !Array.isArray(keys)) {
        return {};
    }
    
    const result = {};
    for (const key of keys) {
        if (key in obj) {
            result[key] = obj[key];
        }
    }
    
    return result;
}

/**
 * 删除对象中的指定键
 * @param {Object} obj - 对象
 * @param {Array<string>} keys - 要删除的键列表
 * @returns {Object} 删除后的对象
 */
function omit(obj, keys) {
    if (!obj) {
        return {};
    }
    
    const keySet = new Set(Array.isArray(keys) ? keys : [keys]);
    const result = {};
    
    for (const key in obj) {
        if (obj.hasOwnProperty(key) && !keySet.has(key)) {
            result[key] = obj[key];
        }
    }
    
    return result;
}

/**
 * 生成唯一ID
 * @returns {string} UUID
 */
function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * 延迟执行
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise} 延迟承诺
 */
function delay(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 分页查询集合所有记录（突破云开发 100 条限制）
 * @param {object} db - 云数据库实例
 * @param {string} collectionName - 集合名称
 * @param {object} [where] - 可选的 where 条件
 * @returns {Promise<Array>} 所有记录
 */
async function getAllRecords(db, collectionName, where) {
    const MAX_LIMIT = 100;
    let baseQuery = db.collection(collectionName);
    if (where) baseQuery = baseQuery.where(where);
    const countRes = await baseQuery.count();
    const total = countRes.total || 0;
    if (total === 0) return [];

    const batchTimes = Math.ceil(total / MAX_LIMIT);
    const tasks = [];
    for (let i = 0; i < batchTimes; i++) {
        let q = db.collection(collectionName);
        if (where) q = q.where(where);
        const promise = q.skip(i * MAX_LIMIT).limit(MAX_LIMIT).get();
        tasks.push(promise);
    }
    const results = await Promise.all(tasks);
    let allData = [];
    results.forEach((result) => {
        allData = allData.concat(result.data || []);
    });
    return allData;
}

module.exports = {
    toNumber,
    toArray,
    toString,
    toBoolean,
    getDeep,
    setDeep,
    deepClone,
    merge,
    pick,
    omit,
    generateId,
    delay,
    getAllRecords
};
