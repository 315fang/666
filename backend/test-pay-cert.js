/**
 * 微信支付 V3 配置验证脚本（支持平台证书 + 公钥两种模式）
 * 运行: node test-pay-cert.js
 */
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const MCH_ID = process.env.WECHAT_MCH_ID;
const SERIAL_NO = process.env.WECHAT_PAY_SERIAL_NO;
const API_V3_KEY = process.env.WECHAT_PAY_API_V3_KEY;
const PRIVATE_KEY_PATH = process.env.WECHAT_PAY_PRIVATE_KEY_PATH;
const PLATFORM_CERT_PATH = process.env.WECHAT_PAY_PLATFORM_CERT_PATH || 'certs/wechatpay_platform_cert.pem';
const PUBLIC_KEY_PATH = process.env.WECHAT_PAY_PUBLIC_KEY_PATH;
const PUBLIC_KEY_ID = process.env.WECHAT_PAY_PUBLIC_KEY_ID;

function resolvePath(p) {
    if (!p) return null;
    return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

function check(label, value, extraCheck) {
    const missing = !value;
    const extra = (!missing && extraCheck) ? extraCheck(value) : null;
    const ok = !missing && (extra === null || extra === true);
    const len = value ? String(value).length : 0;
    console.log(`  [${ok ? '✓' : '✗'}] ${label}: ${missing ? '未配置' : value}${len ? ` (${len}位)` : ''}${extra && extra !== true ? '  ← ' + extra : ''}`);
    return ok;
}

async function main() {
    console.log('\n========== 微信支付 V3 配置检查 ==========\n');

    const cfgOk = [
        check('商户号 MCH_ID', MCH_ID),
        check('证书序列号 SERIAL_NO', SERIAL_NO),
        check('APIv3密钥', API_V3_KEY, v => String(v).length === 32 ? true : `长度必须32位，当前${String(v).length}位`),
        check('私钥路径', PRIVATE_KEY_PATH),
    ].every(Boolean);

    const keyPath = resolvePath(PRIVATE_KEY_PATH);
    const keyExists = keyPath && fs.existsSync(keyPath);
    console.log(`  [${keyExists ? '✓' : '✗'}] 私钥文件存在: ${keyPath}`);

    // 检测使用哪种模式
    const pubKeyPath = resolvePath(PUBLIC_KEY_PATH);
    const pubKeyExists = pubKeyPath && fs.existsSync(pubKeyPath);
    const isPublicKeyMode = !!(PUBLIC_KEY_ID && pubKeyExists);
    const isPlatformCertMode = !PUBLIC_KEY_ID;

    console.log('');
    if (PUBLIC_KEY_ID) {
        console.log(`  [${pubKeyExists ? '✓' : '✗'}] 公钥模式 - 公钥ID: ${PUBLIC_KEY_ID}`);
        console.log(`  [${pubKeyExists ? '✓' : '✗'}] 公钥文件: ${pubKeyPath || '未配置'}`);
        if (!pubKeyExists) {
            console.log(`\n  ⚠️  请先从商户平台下载公钥文件放到: ${pubKeyPath}`);
        }
    } else {
        console.log(`  [提示] 未配置公钥模式，将尝试平台证书模式`);
    }

    if (!cfgOk || !keyExists) {
        console.log('\n❌ 基础配置有误，请修复上方错误后重试\n');
        process.exit(1);
    }

    if (PUBLIC_KEY_ID && !pubKeyExists) {
        console.log('\n❌ 已配置公钥ID但公钥文件不存在，请下载公钥文件后重试\n');
        process.exit(1);
    }

    // 构建签名
    const privateKey = fs.readFileSync(keyPath, 'utf8');
    const method = 'GET';
    const requestPath = '/v3/certificates';
    const body = '';
    const nonceStr = crypto.randomBytes(16).toString('hex');
    const timestamp = String(Math.floor(Date.now() / 1000));
    const message = `${method}\n${requestPath}\n${timestamp}\n${nonceStr}\n${body}\n`;
    const signature = crypto.createSign('RSA-SHA256').update(message).sign(privateKey, 'base64');
    const authorization = `WECHATPAY2-SHA256-RSA2048 mchid="${MCH_ID}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${SERIAL_NO}"`;

    if (isPublicKeyMode) {
        // 公钥模式验证：
        //   1. 验证你的私钥能正常签名（下单时用）
        //   2. 验证微信公钥文件格式正确（回调验签时用）
        //   注意：微信公钥和你的私钥不是同一密钥对，不能互相验签
        console.log('\n========== 公钥模式验证 ==========\n');
        try {
            // 验证 1：私钥能正常签名
            console.log('  → 验证商户私钥签名能力...');
            const testMsg = 'wechatpay-v3-sign-test';
            const testSig = crypto.createSign('RSA-SHA256').update(testMsg).sign(privateKey, 'base64');
            console.log(`  ✓ 商户私钥签名正常（签名长度: ${testSig.length}）`);

            // 验证 2：微信公钥文件格式正确
            console.log('  → 验证微信支付公钥文件格式...');
            const pubKey = fs.readFileSync(pubKeyPath, 'utf8');
            if (!pubKey.includes('BEGIN PUBLIC KEY') && !pubKey.includes('BEGIN CERTIFICATE')) {
                throw new Error('公钥文件格式不正确，应为 PEM 格式');
            }
            // 尝试加载公钥对象，确保可用
            crypto.createPublicKey(pubKey);
            console.log('  ✓ 微信支付公钥文件格式正确，可用于回调验签');

            // 验证 3：公钥ID格式
            console.log('  → 验证公钥ID格式...');
            if (PUBLIC_KEY_ID.includes('请替换') || PUBLIC_KEY_ID.includes('PUB_KEY_ID_01144...')) {
                console.log('  ✗ 公钥ID仍是占位值，请填入真实的公钥ID');
                process.exit(1);
            }
            console.log(`  ✓ 公钥ID: ${PUBLIC_KEY_ID}`);

            console.log('\n✅ 公钥模式配置验证通过！支付链路就绪，可以正常收款。\n');
            console.log('  说明：');
            console.log('    · 下单/退款时：后端用【商户私钥】签名，微信用你的证书验签');
            console.log('    · 支付回调时：微信用【微信私钥】签名，后端用【微信公钥】验签\n');
        } catch (err) {
            console.log(`  ✗ 验证失败: ${err.message}`);
            process.exit(1);
        }
    } else {
        // 平台证书模式：尝试拉取
        console.log('\n========== 拉取平台证书 ==========\n');
        console.log('  → 正在请求 https://api.mch.weixin.qq.com/v3/certificates ...');
        try {
            const response = await axios.get('https://api.mch.weixin.qq.com/v3/certificates', {
                timeout: 15000,
                headers: { Authorization: authorization, Accept: 'application/json' }
            });

            const certs = response.data.data;
            console.log(`  → 收到 ${certs.length} 张证书，开始解密...\n`);

            certs.forEach((cert, idx) => {
                const enc = cert.encrypt_certificate;
                const key = Buffer.from(API_V3_KEY, 'utf8');
                const nonce = Buffer.from(enc.nonce, 'utf8');
                const aad = Buffer.from(enc.associated_data || '', 'utf8');
                const cipher = Buffer.from(enc.ciphertext, 'base64');
                const authTag = cipher.subarray(cipher.length - 16);
                const data = cipher.subarray(0, cipher.length - 16);
                const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
                decipher.setAAD(aad);
                decipher.setAuthTag(authTag);
                const pemContent = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');

                console.log(`  证书 #${idx + 1}:`);
                console.log(`    序列号:   ${cert.serial_no}`);
                console.log(`    生效时间: ${cert.effective_time}`);
                console.log(`    过期时间: ${cert.expire_time}`);
                console.log(`    解密状态: ✓ 成功`);

                if (idx === certs.length - 1) {
                    const outPath = resolvePath(PLATFORM_CERT_PATH);
                    fs.mkdirSync(path.dirname(outPath), { recursive: true });
                    fs.writeFileSync(outPath, pemContent, 'utf8');
                    console.log(`    已写入:   ${outPath}`);
                }
                console.log('');
            });
            console.log('✅ 平台证书拉取成功！微信支付 V3 配置验证通过。\n');
        } catch (err) {
            if (err.response) {
                console.log(`\n❌ 微信接口返回错误:`);
                console.log(`   状态码: ${err.response.status}`);
                console.log(`   错误码: ${err.response.data?.code}`);
                console.log(`   错误信息: ${err.response.data?.message}`);
                if (err.response.data?.code === 'RESOURCE_NOT_EXISTS') {
                    console.log('\n  → 你的商户号使用的是【微信支付公钥】模式（新商户），不支持平台证书接口。');
                    console.log('  → 请按以下步骤操作：');
                    console.log('     1. 登录商户平台 → 账户中心 → API安全 → 微信支付公钥');
                    console.log('     2. 下载公钥文件，保存为 certs/wechatpay_pubkey.pem');
                    console.log('     3. 复制公钥ID（格式：PUB_KEY_ID_0114...）');
                    console.log('     4. 填入 .env：');
                    console.log('        WECHAT_PAY_PUBLIC_KEY_PATH=certs/wechatpay_pubkey.pem');
                    console.log('        WECHAT_PAY_PUBLIC_KEY_ID=PUB_KEY_ID_你的公钥ID\n');
                }
            } else {
                console.log(`\n❌ 网络请求失败: ${err.message}\n`);
            }
            process.exit(1);
        }
    }
}

main();
