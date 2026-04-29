'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const cloudRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(cloudRoot, '..');
const outputRoot = path.join(cloudRoot, 'docs', 'exports');
const mcporterConfigPath = path.join(workspaceRoot, 'config', 'mcporter.json');
const mcporterCliPath = process.env.MCPORTER_CLI_PATH || 'D:/nodejs/node_global/node_modules/mcporter/dist/cli.js';

const DEFAULT_STATUSES = ['paid', 'pending_group', 'pickup_pending', 'agent_confirmed', 'shipping_requested', 'shipped', 'completed'];
const EXPORT_HEADERS = [
    ['order_no', '订单号', 24],
    ['status', '状态', 16],
    ['payment_method', '支付方式', 14],
    ['paid_at', '支付时间', 20],
    ['created_at', '下单时间', 20],
    ['buyer_nickname', '用户昵称', 16],
    ['receiver_name', '收货人', 14],
    ['receiver_phone', '手机号', 16],
    ['receiver_address', '收货地址', 42],
    ['product_summary', '商品', 46],
    ['quantity', '数量', 10],
    ['total_amount', '订单金额', 12],
    ['pay_amount', '实付金额', 12],
    ['delivery_type', '配送方式', 14],
    ['fulfillment_type', '履约方式', 16],
    ['logistics_company', '物流公司', 18],
    ['tracking_no', '物流单号', 22],
    ['shipped_at', '发货时间', 20],
    ['trade_id', '支付流水号', 32],
    ['openid', 'openid', 34]
];

function parseArgs(argv) {
    const args = {
        from: '',
        to: '',
        statuses: DEFAULT_STATUSES,
        out: '',
        format: 'xlsx'
    };

    argv.forEach((arg) => {
        if (arg.startsWith('--from=')) args.from = arg.slice('--from='.length).trim();
        if (arg.startsWith('--to=')) args.to = arg.slice('--to='.length).trim();
        if (arg.startsWith('--statuses=')) {
            args.statuses = arg.slice('--statuses='.length).split(',').map((item) => item.trim()).filter(Boolean);
        }
        if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length).trim();
        if (arg.startsWith('--format=')) args.format = arg.slice('--format='.length).trim().toLowerCase();
    });

    if (!['xlsx', 'csv'].includes(args.format)) {
        throw new Error('--format 只支持 xlsx 或 csv');
    }

    return args;
}

function callMcporter(selector, payload) {
    const result = spawnSync(process.execPath, [
        mcporterCliPath,
        '--config',
        mcporterConfigPath,
        'call',
        selector,
        '--args',
        JSON.stringify(payload),
        '--output',
        'json'
    ], {
        cwd: workspaceRoot,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 50
    });

    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${selector} 执行失败`);

    const stdout = (result.stdout || '').trim();
    return stdout ? JSON.parse(stdout) : null;
}

function readAll(collectionName, projection) {
    const rows = [];
    let offset = 0;
    const limit = 500;

    while (true) {
        const payload = { collectionName, limit, offset };
        if (projection) payload.projection = projection;
        const response = callMcporter('cloudbase.readNoSqlDatabaseContent', payload);
        const batch = Array.isArray(response?.data) ? response.data : [];
        rows.push(...batch);
        if (batch.length < limit) break;
        offset += batch.length;
    }

    return rows;
}

function parseObject(value) {
    if (!value) return {};
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    }
    return typeof value === 'object' ? value : {};
}

function pickString(...values) {
    for (const value of values) {
        const text = String(value ?? '').trim();
        if (text) return text;
    }
    return '';
}

function toDate(value) {
    if (!value) return null;
    if (value.$date != null) return new Date(value.$date);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function toDateTime(value) {
    const date = toDate(value);
    return date ? date.toISOString().replace('T', ' ').slice(0, 19) : '';
}

function toDateKey(value) {
    const date = toDate(value);
    return date ? date.toISOString().slice(0, 10) : '';
}

function toMoney(value) {
    const amount = Number(value || 0);
    return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function csvEscape(value) {
    const text = String(value ?? '');
    if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

function xmlEscape(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function columnName(index) {
    let name = '';
    let value = index;
    while (value > 0) {
        const mod = (value - 1) % 26;
        name = String.fromCharCode(65 + mod) + name;
        value = Math.floor((value - mod) / 26);
    }
    return name;
}

function buildUserMap(users) {
    const map = new Map();
    users.forEach((user) => {
        [user._id, user.id, user._legacy_id, user.openid].forEach((key) => {
            if (key !== undefined && key !== null && key !== '') map.set(String(key), user);
        });
    });
    return map;
}

function buildProductSummary(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) return pickString(order.product_name, order.product?.name);
    return items.map((item) => {
        const name = pickString(item.snapshot_name, item.name, item.product_name, order.product_name, order.product?.name, '未命名商品');
        const spec = pickString(item.snapshot_spec, item.spec, item.sku_name);
        const qty = Number(item.qty || item.quantity || 1) || 1;
        return `${name}${spec ? `/${spec}` : ''} x${qty}`;
    }).join('；');
}

function buildAddress(order) {
    const snapshot = parseObject(order.address_snapshot);
    const address = parseObject(order.address);
    const source = {
        ...address,
        ...snapshot
    };
    const receiverName = pickString(source.receiver_name, source.name, order.receiver_name, order.recipient, order.contact_name);
    const phone = pickString(source.phone, order.phone);
    const fullAddress = [source.province, source.city, source.district, source.detail || source.detail_address || source.address]
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .join('');

    return { receiverName, phone, fullAddress };
}

function resolvePaymentMethod(order) {
    const explicit = pickString(
        order.payment_method,
        order.pay_method,
        order.payment_type,
        order.pay_channel,
        order.payment_channel
    );
    if (explicit) return explicit;
    if (pickString(order.trade_id, order.transaction_id, order.prepay_id, order.pay_params?.prepay_id, order.pay_params?.package)) return '微信支付';
    if (toNumber(order.pay_amount || order.actual_price || order.total_amount) === 0) return '零元/积分';
    return '';
}

function buildRows(orders, users, args) {
    const userMap = buildUserMap(users);
    const statusSet = new Set(args.statuses);

    return orders
        .filter((order) => statusSet.has(String(order.status || '')))
        .filter((order) => {
            const key = toDateKey(order.paid_at || order.pay_time || order.created_at);
            if (args.from && key < args.from) return false;
            if (args.to && key > args.to) return false;
            return true;
        })
        .sort((left, right) => {
            const leftTime = toDate(left.paid_at || left.pay_time || left.created_at)?.getTime() || 0;
            const rightTime = toDate(right.paid_at || right.pay_time || right.created_at)?.getTime() || 0;
            return leftTime - rightTime;
        })
        .map((order) => {
            const user = userMap.get(String(order.openid)) || userMap.get(String(order.buyer_id)) || {};
            const address = buildAddress(order);
            return {
                order_no: order.order_no,
                status: order.status,
                payment_method: resolvePaymentMethod(order),
                paid_at: toDateTime(order.paid_at || order.pay_time),
                created_at: toDateTime(order.created_at),
                buyer_nickname: pickString(user.nickName, user.nickname, user.nick_name, order.nickname),
                receiver_name: address.receiverName,
                receiver_phone: address.phone,
                receiver_address: address.fullAddress,
                product_summary: buildProductSummary(order),
                quantity: order.quantity || (Array.isArray(order.items) ? order.items.reduce((sum, item) => sum + (Number(item.qty || item.quantity || 0) || 0), 0) : ''),
                total_amount: toMoney(order.total_amount),
                pay_amount: toMoney(order.pay_amount || order.actual_price || order.total_amount),
                delivery_type: order.delivery_type || 'express',
                fulfillment_type: order.fulfillment_type || '',
                logistics_company: pickString(order.logistics_company, order.shipping_company),
                tracking_no: order.tracking_no || '',
                shipped_at: toDateTime(order.shipped_at),
                trade_id: order.trade_id || order.transaction_id || '',
                openid: order.openid || ''
            };
        });
}

function writeCsv(rows, outPath) {
    const lines = [
        EXPORT_HEADERS.map(([, label]) => csvEscape(label)).join(','),
        ...rows.map((row) => EXPORT_HEADERS.map(([key]) => csvEscape(row[key])).join(','))
    ];

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

function writeText(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
}

function buildWorksheetXml(rows) {
    const tableRows = [
        EXPORT_HEADERS.map(([, label]) => label),
        ...rows.map((row) => EXPORT_HEADERS.map(([key]) => row[key] ?? ''))
    ];
    const lastCol = columnName(EXPORT_HEADERS.length);
    const lastRow = Math.max(tableRows.length, 1);
    const cols = EXPORT_HEADERS.map(([, , width], index) => (
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
    )).join('');
    const rowXml = tableRows.map((row, rowIndex) => {
        const excelRow = rowIndex + 1;
        const cells = row.map((value, colIndex) => {
            const ref = `${columnName(colIndex + 1)}${excelRow}`;
            const isNumber = rowIndex > 0 && ['quantity', 'total_amount', 'pay_amount'].includes(EXPORT_HEADERS[colIndex][0]);
            if (isNumber) return `<c r="${ref}" s="2"><v>${xmlEscape(value)}</v></c>`;
            const style = rowIndex === 0 ? '1' : '0';
            return `<c r="${ref}" t="inlineStr" s="${style}"><is><t>${xmlEscape(value)}</t></is></c>`;
        }).join('');
        return `<row r="${excelRow}">${cells}</row>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft" activeCell="A2" sqref="A2"/>
    </sheetView>
  </sheetViews>
  <cols>${cols}</cols>
  <sheetData>${rowXml}</sheetData>
  <autoFilter ref="A1:${lastCol}${lastRow}"/>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

function writeXlsx(rows, outPath) {
    const tempRoot = path.join(outputRoot, `.xlsx-build-${Date.now()}`);
    const xlRoot = path.join(tempRoot, 'xl');
    writeText(path.join(tempRoot, '[Content_Types].xml'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);
    writeText(path.join(tempRoot, '_rels', '.rels'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
    writeText(path.join(tempRoot, 'docProps', 'app.xml'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>CloudBase Export</Application>
</Properties>`);
    writeText(path.join(tempRoot, 'docProps', 'core.xml'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>paid orders export</dc:title>
  <dc:creator>CloudBase export script</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
</cp:coreProperties>`);
    writeText(path.join(xlRoot, 'workbook.xml'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="已支付订单" sheetId="1" r:id="rId1"/></sheets>
</workbook>`);
    writeText(path.join(xlRoot, '_rels', 'workbook.xml.rels'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
    writeText(path.join(xlRoot, 'styles.xml'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><name val="Microsoft YaHei"/><color rgb="FFFFFFFF"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf>
  </cellXfs>
</styleSheet>`);
    writeText(path.join(xlRoot, 'worksheets', 'sheet1.xml'), buildWorksheetXml(rows));

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    if (fs.existsSync(outPath)) fs.rmSync(outPath, { force: true });
    const command = [
        '$ErrorActionPreference = "Stop"',
        `Set-Location -LiteralPath ${JSON.stringify(tempRoot)}`,
        `Compress-Archive -Path * -DestinationPath ${JSON.stringify(outPath)} -Force`
    ].join('; ');
    const result = spawnSync('powershell', ['-NoProfile', '-Command', command], {
        cwd: tempRoot,
        encoding: 'utf8'
    });
    fs.rmSync(tempRoot, { recursive: true, force: true });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || '生成 xlsx 失败');
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const dateLabel = [args.from || 'all', args.to || 'all'].join('_to_');
    const outPath = args.out
        ? path.resolve(cloudRoot, args.out)
        : path.join(outputRoot, `paid-orders-${dateLabel}-${Date.now()}.${args.format}`);

    const orders = readAll('orders');
    const users = readAll('users', { _id: 1, id: 1, _legacy_id: 1, openid: 1, nickName: 1, nickname: 1, nick_name: 1 });
    const rows = buildRows(orders, users, args);
    if (args.format === 'csv') {
        writeCsv(rows, outPath);
    } else {
        writeXlsx(rows, outPath);
    }

    console.log(JSON.stringify({
        output: outPath,
        format: args.format,
        exported: rows.length,
        statuses: args.statuses,
        from: args.from || null,
        to: args.to || null
    }, null, 2));
}

main();
