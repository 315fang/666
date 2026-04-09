/**
 * 物流公司代码 → 展示名称（与常见 ERP/快递100 编码对齐，未知则原样显示）
 */
const LABELS = {
    SF: '顺丰速运',
    YTO: '圆通速递',
    ZTO: '中通快递',
    STO: '申通快递',
    YD: '韵达快递',
    JT: '极兔速递',
    JD: '京东物流',
    EMS: '中国邮政 EMS',
    DBL: '德邦快递',
    UC: '优速快递',
    ANE: '安能物流',
    SN: '苏宁物流',
    FEDEX: '联邦快递',
    UPS: 'UPS',
    DHL: 'DHL',
    CAINIAO: '菜鸟',
    POST: '中国邮政',
    OTHER: '其他快递',
    AUTO: '自动识别'
};

function logisticsCompanyLabel(code) {
    if (code == null || code === '') return '';
    const s = String(code).trim();
    const up = s.toUpperCase();
    return LABELS[up] || s;
}

module.exports = {
    logisticsCompanyLabel
};
