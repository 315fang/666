/**
 * 将 Express / 代理常见的 IP 字符串规范为更易读的形式（如 IPv4 映射 IPv6 → 纯 IPv4）。
 * @param {string|undefined|null} raw
 * @returns {string|null}
 */
function normalizeClientIp(raw) {
    if (raw == null || raw === '') return null;
    let ip = String(raw).split(',')[0].trim();
    if (!ip) return null;
    const lower = ip.toLowerCase();
    if (lower === '::1') return '127.0.0.1';
    const m = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
    if (m) return m[1];
    return ip;
}

module.exports = { normalizeClientIp };
