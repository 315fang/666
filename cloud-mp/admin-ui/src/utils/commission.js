const COMMISSION_TYPE_LABELS = {
  direct: '直推佣金',
  indirect: '间推佣金',
  gap: '级差收益',
  agent_fulfillment: '代理发货利润',
  same_level: '平级奖',
  n_price_gap: 'N路径差价',
  n_separation_bonus: 'N路径脱离奖励',
  fund_pool: '基金池奖励',
  self: '自购返利',
  stock_diff: '库存差价',
  agent_assist: '代理协助奖',
  b2_assist: 'B2协助奖',
  region_agent: '区域代理收益',
  region_b3_virtual: '虚拟B3区域佣金',
  pickup_subsidy: '自提核销补贴',
  year_end_dividend: '年终分红'
}

export const COMMISSION_TYPE_OPTIONS = [
  { value: 'direct', label: COMMISSION_TYPE_LABELS.direct },
  { value: 'indirect', label: COMMISSION_TYPE_LABELS.indirect },
  { value: 'gap', label: COMMISSION_TYPE_LABELS.gap },
  { value: 'agent_fulfillment', label: COMMISSION_TYPE_LABELS.agent_fulfillment },
  { value: 'same_level', label: COMMISSION_TYPE_LABELS.same_level },
  { value: 'n_price_gap', label: COMMISSION_TYPE_LABELS.n_price_gap },
  { value: 'n_separation_bonus', label: COMMISSION_TYPE_LABELS.n_separation_bonus },
  { value: 'Fund_Pool', label: COMMISSION_TYPE_LABELS.fund_pool },
  { value: 'self', label: COMMISSION_TYPE_LABELS.self },
  { value: 'Stock_Diff', label: COMMISSION_TYPE_LABELS.stock_diff },
  { value: 'agent_assist', label: COMMISSION_TYPE_LABELS.agent_assist },
  { value: 'B2_Assist', label: COMMISSION_TYPE_LABELS.b2_assist },
  { value: 'region_agent', label: COMMISSION_TYPE_LABELS.region_agent },
  { value: 'region_b3_virtual', label: COMMISSION_TYPE_LABELS.region_b3_virtual },
  { value: 'pickup_subsidy', label: COMMISSION_TYPE_LABELS.pickup_subsidy },
  { value: 'year_end_dividend', label: COMMISSION_TYPE_LABELS.year_end_dividend }
]

export function getCommissionTypeLabel(type) {
  if (!type) return '佣金'
  const normalized = String(type).trim().toLowerCase()
  return COMMISSION_TYPE_LABELS[normalized] || String(type)
}
