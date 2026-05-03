/**
 * EntityPicker user adapter
 *
 * 把 admin-ui users API 适配成 EntityPicker 期望的 fetchPage 形态。
 *
 * filters 透传字段：
 *   - role: 'admin' | 'user' | 'distributor'
 *   - status: 'active' | 'frozen'
 *   - level_id: number
 */
import { getUsers } from '@/api/modules/users'

function formatRole(_row, _col, value) {
  const map = { admin: '管理员', user: '普通用户', distributor: '分销商' }
  return map[value] || value || '-'
}

function formatStatus(_row, _col, value) {
  const map = { active: '正常', frozen: '冻结' }
  return map[value] || value || '-'
}

function maskPhone(_row, _col, value) {
  if (!value) return '-'
  const s = String(value)
  if (s.length < 7) return s
  return s.slice(0, 3) + '****' + s.slice(-4)
}

export default {
  title: '选择用户',
  itemKey: 'id',
  searchPlaceholder: '昵称 / 手机号 / OpenID',
  previewTitleKey: 'nickname',

  async fetchPage({ keyword, page, limit, filters }) {
    const params = {
      page,
      limit,
      ...(keyword ? { keyword } : {}),
      ...(filters || {})
    }
    const res = await getUsers(params)
    const data = res?.data ?? res
    if (Array.isArray(data)) return { list: data, total: data.length }
    return {
      list: Array.isArray(data?.list) ? data.list : [],
      total: Number(data?.total ?? 0)
    }
  },

  filterSchema: [
    {
      field: 'role',
      label: '角色',
      type: 'select',
      width: '120px',
      options: [
        { label: '普通用户', value: 'user' },
        { label: '分销商', value: 'distributor' },
        { label: '管理员', value: 'admin' }
      ]
    },
    {
      field: 'status',
      label: '状态',
      type: 'select',
      width: '110px',
      options: [
        { label: '正常', value: 'active' },
        { label: '冻结', value: 'frozen' }
      ]
    }
  ],

  columns: [
    { prop: 'id', label: 'ID', width: 80 },
    { prop: 'nickname', label: '昵称', minWidth: 140 },
    { prop: 'phone', label: '手机', width: 130, formatter: maskPhone },
    { prop: 'role', label: '角色', width: 100, formatter: formatRole },
    { prop: 'status', label: '状态', width: 80, formatter: formatStatus }
  ],

  previewFields: [
    { prop: 'id', label: 'ID' },
    { prop: 'nickname', label: '昵称' },
    { prop: 'phone', label: '手机', formatter: maskPhone },
    { prop: 'role', label: '角色', formatter: formatRole },
    { prop: 'level_name', label: '等级' },
    { prop: 'created_at', label: '注册时间' },
    { prop: 'status', label: '状态', formatter: formatStatus }
  ]
}
