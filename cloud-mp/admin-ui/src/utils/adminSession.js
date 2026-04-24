const TOKEN_KEY = 'admin_token'
const INFO_KEY = 'admin_info'

export function readStoredAdminToken() {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function readStoredAdminInfo() {
  if (typeof localStorage === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(INFO_KEY) || '{}')
  } catch (_) {
    localStorage.removeItem(INFO_KEY)
    return {}
  }
}

export function writeStoredAdminSession(token, adminInfo) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(TOKEN_KEY, token || '')
  localStorage.setItem(INFO_KEY, JSON.stringify(adminInfo || {}))
}

export function writeStoredAdminInfo(adminInfo) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(INFO_KEY, JSON.stringify(adminInfo || {}))
}

export function clearStoredAdminSession() {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(INFO_KEY)
}
