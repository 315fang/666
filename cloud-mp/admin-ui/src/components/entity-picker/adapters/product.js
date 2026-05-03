/**
 * EntityPicker product adapter
 *
 * 把 admin-ui catalog API 适配成 EntityPicker 期望的 fetchPage 形态。
 *
 * fetchPage 入参 { keyword, page, limit, filters } -> 出参 { list, total }
 *
 * filters 透传字段（与 admin-api /products 后端 query 对齐）：
 *   - status: 'active' | 'archived' | 'draft'
 *   - category_id: number
 *   - product_type: 'normal' | 'group_buy' | 'flash_sale' | …
 */
import { getProducts } from '@/api/modules/catalog'

const ASSET_FALLBACK = '-'

function formatPrice(_row, _col, value) {
  if (value === null || value === undefined || value === '') return '-'
  const num = Number(value)
  if (!Number.isFinite(num)) return String(value)
  return `¥${num.toFixed(2)}`
}

function formatStatus(_row, _col, value) {
  const map = { active: '在售', archived: '已下架', draft: '草稿' }
  return map[value] || value || '-'
}

export default {
  title: '选择商品',
  itemKey: 'id',
  searchPlaceholder: '商品名称 / SKU / 编码',
  previewTitleKey: 'name',

  async fetchPage({ keyword, page, limit, filters }) {
    const params = {
      page,
      limit,
      ...(keyword ? { keyword } : {}),
      ...(filters || {})
    }
    const res = await getProducts(params)
    // admin-api/products 返回结构：{ list: [...], total, page, limit } 或老接口直接 array
    const data = res?.data ?? res
    if (Array.isArray(data)) return { list: data, total: data.length }
    return {
      list: Array.isArray(data?.list) ? data.list : [],
      total: Number(data?.total ?? 0)
    }
  },

  filterSchema: [
    {
      field: 'status',
      label: '状态',
      type: 'select',
      width: '110px',
      options: [
        { label: '在售', value: 'active' },
        { label: '已下架', value: 'archived' },
        { label: '草稿', value: 'draft' }
      ]
    }
  ],

  columns: [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'name', label: '商品名称', minWidth: 180 },
    { prop: 'retail_price', label: '零售价', width: 100, formatter: formatPrice },
    { prop: 'status', label: '状态', width: 90, formatter: formatStatus }
  ],

  previewFields: [
    { prop: 'id', label: 'ID' },
    { prop: 'name', label: '名称' },
    { prop: 'retail_price', label: '零售价', formatter: formatPrice },
    { prop: 'cost_price', label: '成本价', formatter: formatPrice },
    { prop: 'stock', label: '库存' },
    { prop: 'sku_code', label: 'SKU' },
    { prop: 'category_name', label: '分类' },
    { prop: 'status', label: '状态', formatter: formatStatus },
    {
      prop: 'cover_image',
      label: '封面',
      formatter: (_row, _col, v) => v ? '✓ 已上传' : ASSET_FALLBACK
    }
  ]
}
