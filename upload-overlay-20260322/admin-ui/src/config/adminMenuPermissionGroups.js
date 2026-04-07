/**
 * 管理员权限勾选分组：与 layout 侧栏 group + 菜单项一致（由 router 动态生成）
 * 额外权限挂在对应业务分组下（无独立侧栏项的会标注说明）
 */
import router from '@/router'

/** 与 layout/index.vue groupedMenuItems 一致 */
const GROUP_ORDER = [
  '经营概览',
  '订单与资金',
  '商品与营销',
  '内容与设计',
  '用户与渠道',
  '业务策略',
  '平台与运维',
  '其他'
]

/**
 * 侧栏同组内的补充权限（后端 adminPermissionCatalog 中有、但无独立侧栏入口或需单独说明）
 */
const EXTRA_ITEMS_BY_GROUP = {
  订单与资金: [
    { key: 'order_amount_adjust', label: '订单改价' },
    { key: 'order_force_cancel', label: '订单强制取消' },
    { key: 'order_force_complete', label: '订单强制完成' }
  ],
  用户与渠道: [
    { key: 'distribution', label: '分销管理（预留权限键）' },
    { key: 'user_balance_adjust', label: '用户余额调整' },
    { key: 'user_role_manage', label: '用户角色修改' },
    { key: 'user_parent_manage', label: '用户上级修改' },
    { key: 'user_status_manage', label: '用户封禁 / 解封' }
  ],
  内容与设计: [
    { key: 'notification', label: '群发消息接口（permission: notification）' }
  ],
  平台与运维: [{ key: 'settlements', label: '结算管理（权限键 settlements）' }]
}

export function buildMenuPermissionGroups() {
  const children = router.options.routes.find((r) => r.path === '/')?.children || []

  /** @type {Record<string, Map<string, { titles: string[], navHidden: boolean, minOrder: number }>>} */
  const byGroup = {}

  for (const item of children) {
    const m = item.meta
    if (!m?.permission || !m?.title) continue
    const g = m.group || '其他'
    if (!byGroup[g]) byGroup[g] = new Map()
    const perm = m.permission
    const cur = byGroup[g].get(perm) || { titles: [], navHidden: true, minOrder: 9999 }
    cur.titles.push(m.title)
    cur.minOrder = Math.min(cur.minOrder, Number(m.order ?? 9999))
    if (m.nav !== false) cur.navHidden = false
    byGroup[g].set(perm, cur)
  }

  const buildItemsForGroup = (gname) => {
    const map = byGroup[gname]
    const items = []
    if (map) {
      for (const [perm, { titles, navHidden, minOrder }] of map.entries()) {
        const uniq = [...new Set(titles)]
        let label = uniq.join('、')
        if (navHidden) label += '（侧栏无菜单，仅授权）'
        items.push({ key: perm, label, _order: minOrder })
      }
    }
    const extras = EXTRA_ITEMS_BY_GROUP[gname] || []
    for (const ex of extras) {
      if (!items.some((i) => i.key === ex.key)) {
        items.push({ key: ex.key, label: ex.label, _order: 99999 })
      }
    }
    items.sort((a, b) => a._order - b._order || a.label.localeCompare(b.label, 'zh-CN'))
    return items.map(({ key, label }) => ({ key, label }))
  }

  const groups = []
  const used = new Set()

  for (const gname of GROUP_ORDER) {
    if (!byGroup[gname] && !(EXTRA_ITEMS_BY_GROUP[gname]?.length)) continue
    const items = buildItemsForGroup(gname)
    if (!items.length) continue
    used.add(gname)
    groups.push({ name: gname, items })
  }

  for (const gname of Object.keys(byGroup)) {
    if (used.has(gname)) continue
    const items = buildItemsForGroup(gname)
    if (items.length) groups.push({ name: gname, items })
  }

  return groups
}

/** 权限矩阵 / 列表展示用扁平列表 */
export function flattenPermissionDefs(groups) {
  const seen = new Set()
  const list = []
  for (const g of groups) {
    for (const it of g.items) {
      if (seen.has(it.key)) continue
      seen.add(it.key)
      list.push({ key: it.key, name: it.label, group: g.name })
    }
  }
  list.sort((a, b) => a.key.localeCompare(b.key))
  return list
}
