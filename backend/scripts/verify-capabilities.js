require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { testConnection } = require('../config/database');

function exists(p) {
    if (!p) return false;
    const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), 'backend', p.replace(/^\.\//, ''));
    return fs.existsSync(abs);
}

async function main() {
    const checks = [];

    checks.push({ name: 'Database', ok: await testConnection() });

    try {
        const [festival, banners, products] = await Promise.all([
            axios.get('http://127.0.0.1:3001/api/activity/festival-config'),
            axios.get('http://127.0.0.1:3001/api/content/banners'),
            axios.get('http://127.0.0.1:3001/api/products?page=1&limit=1')
        ]);
        checks.push({ name: 'Public APIs', ok: [festival, banners, products].every(r => r.status === 200) });
    } catch (e) {
        checks.push({ name: 'Public APIs', ok: false, detail: e.message });
    }

    const payFields = {
        WECHAT_MCH_ID: !!process.env.WECHAT_MCH_ID,
        WECHAT_PAY_SERIAL_NO: !!process.env.WECHAT_PAY_SERIAL_NO,
        WECHAT_PAY_API_V3_KEY: !!process.env.WECHAT_PAY_API_V3_KEY,
        WECHAT_PAY_PRIVATE_KEY_PATH: exists(process.env.WECHAT_PAY_PRIVATE_KEY_PATH),
        WECHAT_PAY_CERT_PATH: exists(process.env.WECHAT_PAY_CERT_PATH),
        WECHAT_PAY_PLATFORM_CERT_PATH: exists(process.env.WECHAT_PAY_PLATFORM_CERT_PATH),
        WECHAT_PAY_NOTIFY_URL: !!process.env.WECHAT_PAY_NOTIFY_URL
    };
    checks.push({
        name: 'WeChat Pay V3',
        ok: Object.values(payFields).every(Boolean),
        detail: payFields
    });

    console.log(JSON.stringify(checks, null, 2));
    const failed = checks.filter(item => !item.ok);
    process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
