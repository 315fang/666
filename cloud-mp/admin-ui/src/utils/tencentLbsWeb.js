/**
 * 浏览器直连腾讯位置服务 WebService（需 Key 与域名白名单）
 */
function getKey() {
  return (import.meta.env.VITE_TENCENT_MAP_KEY || '').trim()
}

/** @param {string} fullAddress */
export async function webGeocodeAddress(fullAddress) {
  const key = getKey()
  if (!key || !fullAddress?.trim()) return null
  const url = `https://apis.map.qq.com/ws/geocoder/v1/?address=${encodeURIComponent(fullAddress.trim())}&key=${encodeURIComponent(key)}`
  const res = await fetch(url)
  const j = await res.json()
  if (j.status !== 0 || !j.result?.location) return null
  const { lat, lng } = j.result.location
  const la = parseFloat(lat)
  const lo = parseFloat(lng)
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null
  return { latitude: la, longitude: lo }
}

/** @param {number} lat @param {number} lng */
export async function webReverseGeocode(lat, lng) {
  const key = getKey()
  if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const loc = `${lat},${lng}`
  const url = `https://apis.map.qq.com/ws/geocoder/v1/?location=${encodeURIComponent(loc)}&key=${encodeURIComponent(key)}`
  const res = await fetch(url)
  const j = await res.json()
  if (j.status !== 0 || !j.result) return null
  const ad = j.result.address_component || {}
  const formatted = j.result.formatted_addresses?.recommend || j.result.address || ''
  return {
    province: ad.province || '',
    city: ad.city || '',
    district: ad.district || '',
    address: formatted || ''
  }
}

/**
 * @param {string} keyword
 * @param {{ province?: string, city?: string, latitude?: number, longitude?: number }} [opts]
 */
export async function webPlaceSearch(keyword, opts = {}) {
  const key = getKey()
  if (!key || !keyword?.trim()) return null
  const base = 'https://apis.map.qq.com/ws/place/v1/search'
  const region = [opts.province, opts.city].filter((x) => x != null && String(x).trim()).join('')
  let boundary
  if (Number.isFinite(opts.latitude) && Number.isFinite(opts.longitude)) {
    boundary = `nearby(${opts.latitude},${opts.longitude},80000)`
  } else if (region?.trim()) {
    boundary = `region(${encodeURIComponent(region.trim())},0)`
  } else {
    boundary = `nearby(31.29834,120.58531,500000)`
  }
  const url = `${base}?keyword=${encodeURIComponent(keyword.trim())}&boundary=${boundary}&page_size=10&page_index=1&key=${encodeURIComponent(key)}`
  const res = await fetch(url)
  const j = await res.json()
  if (j.status !== 0 || !j.data?.length) return null
  const first = j.data[0]
  const lat = parseFloat(first.location?.lat)
  const lng = parseFloat(first.location?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    latitude: lat,
    longitude: lng,
    title: first.title || keyword,
    address: first.address || ''
  }
}
