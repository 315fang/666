/**
 * 管理员权限勾选分组：与当前导航工作区保持一致（由 router meta 动态生成）
 * 额外权限挂在对应业务分组下（无独立侧栏项的会标注说明）
 */
import router from '@/router'
import { ADMIN_GROUP_ORDER, getAdminRouteEntries } from '@/config/adminNavigation'

/**
 * 侧栏同组内的补充权限（后端 adminPermissionCatalog 中有、但无独立侧栏入口或需单独说明）
 */
const EXTRA_ITEMS_BY_GROUP = {
  交易与履约: [
    { key: 'order_amount_adjust', label: '订单改价' },
    { key: 'order_force_cancel', label: '订单强制取消' },
    { key: 'order_force_complete', label: '订单强制完成' }
  ],
  用户与渠道: [
    { key: 'distribution', label: '分销管理（预留权限键）' },
    { key: 'user_balance_adjust', label: '用户余额调整' },
    { key: 'user_role_manage', label: '用户角色修改' },
    { key: 'user_parent_manage', label: '用户上级修改' },
    { key: 'user_status_manage', label: '用户封禁 / 解封' },
    { key: 'user_portal_password_manage', label: '用户业务密码重置 / 解锁' }
  ]
}

export function buildMenuPermissionGroups() {
  const entries = getAdminRouteEntries(router.options.routes, { includeHidden: true })

  /** @type {Record<string, Map<string, { titles: Array<{ title: string, sectionOrder: number, order: number }>, navHidden: boolean, minOrder: number }>>} */
  const byGroup = {}

  for (const item of entries) {
    if (!item.permission || !item.title) continue
    const g = item.group || '其他'
    if (!byGroup[g]) byGroup[g] = new Map()
    const perm = item.permission
    const cur = byGroup[g].get(perm) || { titles: [], navHidden: true, minOrder: 9999 }
    const itemRank = Number(item.sectionOrder ?? 999) * 1000 + Number(item.order ?? 999)
    cur.titles.push({
      title: item.title,
      sectionOrder: Number(item.sectionOrder ?? 999),
      order: Number(item.order ?? 999)
    })
    cur.minOrder = Math.min(cur.minOrder, itemRank)
    if (!item.navHidden) cur.navHidden = false
    byGroup[g].set(perm, cur)
  }

  const buildItemsForGroup = (gname) => {
    const map = byGroup[gname]
    const items = []
    if (map) {
      for (const [perm, { titles, navHidden, minOrder }] of map.entries()) {
        const uniq = [...new Map(
          titles
            .sort((a, b) => a.sectionOrder - b.sectionOrder || a.order - b.order || a.title.localeCompare(b.title, 'zh-CN'))
            .map((item) => [item.title, item.title])
        ).values()]
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

  for (const gname of ADMIN_GROUP_ORDER) {
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
  const safeGroups = Array.isArray(groups) ? groups.filter((group) => group && typeof group === 'object') : []
  for (const g of safeGroups) {
    const items = Array.isArray(g.items) ? g.items : []
    for (const it of items) {
      if (!it?.key) continue
      if (seen.has(it.key)) continue
      seen.add(it.key)
      list.push({ key: it.key, name: it.label || it.key, group: g.name || '其他' })
    }
  }
  list.sort((a, b) => a.key.localeCompare(b.key))
  return list
}
