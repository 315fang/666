import dayjs from 'dayjs'

/**
 * 标准日期格式：YYYY-MM-DD HH:mm
 */
export const formatDate = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm') : '-'

/**
 * 简短日期格式：MM-DD HH:mm（Dashboard / 列表等空间有限场景）
 */
export const formatDateShort = (d) => d ? dayjs(d).format('MM-DD HH:mm') : '-'

/**
 * 完整日期时间格式：YYYY-MM-DD HH:mm:ss
 */
export const formatDateTime = (d) => d ? dayjs(d).format('YYYY-MM-DD HH:mm:ss') : '-'

/**
 * 列表/详情中展示客户端 IP（IPv4 映射地址 ::ffff:x.x.x.x → x.x.x.x，本地 IPv6 环回 → 127.0.0.1）
 */
export const formatClientIp = (raw) => {
  if (raw == null || raw === '') return ''
  const ip = String(raw).split(',')[0].trim()
  if (!ip) return ''
  const lower = ip.toLowerCase()
  if (lower === '::1') return '127.0.0.1'
  const m = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)
  if (m) return m[1]
  return ip
}
