import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(__dirname, "source.json");
const outputPath = path.join(__dirname, "测试订单-已支付未发货.xlsx");

const raw = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const orders = raw.data || [];

function toDate(value) {
  if (!value) return "";
  if (value.$date) return new Date(Number(value.$date));
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date;
}

function money(value) {
  if (value === null || value === undefined || value === "") return "";
  const num = Number(value);
  return Number.isFinite(num) ? num : value;
}

function getReceiver(address = {}) {
  return address.receiver_name || address.name || "";
}

function getDetail(address = {}) {
  return address.detail || address.detail_address || "";
}

function fullAddress(address = {}) {
  const parts = [address.province, address.city, address.district, getDetail(address)].filter(Boolean);
  return parts.join("");
}

function itemSummary(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  if (!items.length) return order.product_name || "";
  return items.map((item) => {
    const name = item.snapshot_name || item.name || order.product_name || "";
    const qty = item.quantity ?? item.qty ?? "";
    return qty ? `${name} x${qty}` : name;
  }).join("; ");
}

function totalQty(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.reduce((sum, item) => sum + Number(item.quantity ?? item.qty ?? 0), 0);
}

const rows = orders.map((order, index) => {
  const address = order.address || {};
  return [
    index + 1,
    order.order_no || "",
    toDate(order.created_at),
    toDate(order.paid_at),
    order.status || "",
    money(order.pay_amount),
    money(order.total_amount),
    money(order.actual_price),
    money(order.coupon_discount),
    money(order.points_discount),
    itemSummary(order),
    totalQty(order),
    getReceiver(address),
    address.phone || "",
    address.province || "",
    address.city || "",
    address.district || "",
    getDetail(address),
    fullAddress(address),
    order.delivery_type || "",
    order.fulfillment_type || "",
    order.type || "",
    order.trade_id || "",
    order.openid || "",
    order.test_order_reason || "",
  ];
});

const workbook = Workbook.create();
const summary = workbook.worksheets.add("汇总");
const detail = workbook.worksheets.add("已支付未发货明细");

summary.showGridLines = false;
detail.showGridLines = false;

summary.getRange("A1:H1").merge();
summary.getRange("A1").values = [["测试订单 - 已支付未发货导出"]];
summary.getRange("A1").format = {
  fill: "#1F4E79",
  font: { bold: true, color: "#FFFFFF", size: 16 },
};
summary.getRange("A2:H2").merge();
summary.getRange("A2").values = [[`导出时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}；筛选条件：is_test_order=true 且 status=paid。`]];
summary.getRange("A2").format = { font: { color: "#374151" } };

summary.getRange("A4:B8").values = [
  ["指标", "值"],
  ["订单数", rows.length],
  ["实付合计", rows.reduce((sum, row) => sum + (Number(row[5]) || 0), 0)],
  ["订单总额合计", rows.reduce((sum, row) => sum + (Number(row[6]) || 0), 0)],
  ["涉及手机号数", new Set(rows.map((row) => row[13]).filter(Boolean)).size],
];
summary.getRange("A4:B4").format = {
  fill: "#D9EAF7",
  font: { bold: true, color: "#1F2937" },
};
summary.getRange("B6:B7").format.numberFormat = "¥#,##0.00";
summary.getRange("A4:B8").format.borders = {
  insideHorizontal: { style: "Continuous", color: "#D1D5DB" },
  insideVertical: { style: "Continuous", color: "#D1D5DB" },
  edgeBottom: { style: "Continuous", color: "#9CA3AF" },
  edgeTop: { style: "Continuous", color: "#9CA3AF" },
  edgeLeft: { style: "Continuous", color: "#9CA3AF" },
  edgeRight: { style: "Continuous", color: "#9CA3AF" },
};
summary.getRange("A10:H10").values = [["说明", "", "", "", "", "", "", ""]];
summary.getRange("A10:H10").merge();
summary.getRange("A10").format = { fill: "#F3F4F6", font: { bold: true } };
summary.getRange("A11:H13").merge();
summary.getRange("A11").values = [["本文件只包含当前仍标记为测试订单，且订单状态为 paid 的记录。已取消测试标记的订单、已退款、退款中、已发货、已完成、已取消订单不在本次明细内。"]];
summary.getRange("A11").format = { wrapText: true, font: { color: "#374151" } };

summary.getRange("A:A").format.columnWidthPx = 140;
summary.getRange("B:B").format.columnWidthPx = 160;
summary.getRange("A11:H13").format.rowHeightPx = 54;

const headers = [
  "序号",
  "订单号",
  "下单时间",
  "支付时间",
  "状态",
  "实付金额",
  "订单总额",
  "实际价格",
  "优惠券抵扣",
  "积分抵扣",
  "商品明细",
  "数量",
  "收货人",
  "手机号",
  "省",
  "市",
  "区/县",
  "详细地址",
  "完整地址",
  "配送方式",
  "履约方式",
  "订单类型",
  "微信交易号",
  "openid",
  "测试原因",
];

detail.getRangeByIndexes(0, 0, 1, headers.length).values = [headers];
if (rows.length) {
  detail.getRangeByIndexes(1, 0, rows.length, headers.length).values = rows;
}

const usedRows = Math.max(rows.length + 1, 2);
const tableRange = `A1:Y${usedRows}`;
const table = detail.tables.add(tableRange, true, "PaidTestOrdersTable");
table.style = "TableStyleMedium2";
table.showFilterButton = true;

detail.freezePanes.freezeRows(1);
detail.getRange("A1:Y1").format = {
  fill: "#1F4E79",
  font: { bold: true, color: "#FFFFFF" },
  wrapText: true,
};
detail.getRange(`C2:D${usedRows}`).setNumberFormat("yyyy-mm-dd hh:mm:ss");
detail.getRange(`F2:J${usedRows}`).setNumberFormat("¥#,##0.00");
detail.getRange(`A1:Y${usedRows}`).format = {
  verticalAlignment: "Top",
  wrapText: true,
};

const widths = [
  52, 190, 150, 150, 80, 90, 90, 90, 90, 90,
  260, 60, 90, 110, 90, 90, 90, 260, 360, 90,
  100, 90, 220, 260, 180,
];
widths.forEach((width, col) => {
  detail.getRangeByIndexes(0, col, usedRows, 1).format.columnWidthPx = width;
});
detail.getRange(`A2:Y${usedRows}`).format.rowHeightPx = 44;

const inspect = await workbook.inspect({
  kind: "table",
  range: "已支付未发货明细!A1:Y8",
  include: "values",
  tableMaxRows: 8,
  tableMaxCols: 25,
  maxChars: 6000,
});
console.log(inspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "formula error scan",
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: "已支付未发货明细",
  range: "A1:Y8",
  scale: 1,
  format: "png",
});
await fs.writeFile(path.join(__dirname, "preview.png"), new Uint8Array(await preview.arrayBuffer()));

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);
console.log(outputPath);
