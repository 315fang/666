import request from '@/utils/request'

/**
 * 通过 admin-api 服务端代理访问腾讯位置服务，避免浏览器直连 WebService 的来源鉴权问题。
 */

/** @param {string} fullAddress */
export async function webGeocodeAddress(fullAddress) {
  const address = String(fullAddress || '').trim()
  if (!address) return null
  const data = await request({
    url: '/map/geocode',
    method: 'get',
    params: { address },
    skipErrorMessage: true
  })
  const la = parseFloat(data?.latitude)
  const lo = parseFloat(data?.longitude)
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null
  return { latitude: la, longitude: lo }
}

/** @param {number} lat @param {number} lng */
export async function webReverseGeocode(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const data = await request({
    url: '/map/reverse-geocode',
    method: 'get',
    params: { latitude: lat, longitude: lng },
    skipErrorMessage: true
  })
  return {
    province: data?.province || '',
    city: data?.city || '',
    district: data?.district || '',
    address: data?.address || ''
  }
}

/**
 * @param {string} keyword
 * @param {{ province?: string, city?: string, latitude?: number, longitude?: number }} [opts]
 */
export async function webPlaceSearch(keyword, opts = {}) {
  const normalizedKeyword = String(keyword || '').trim()
  if (!normalizedKeyword) return null
  const data = await request({
    url: '/map/place-search',
    method: 'get',
    params: {
      keyword: normalizedKeyword,
      province: opts.province,
      city: opts.city,
      latitude: opts.latitude,
      longitude: opts.longitude
    },
    skipErrorMessage: true
  })
  const lat = parseFloat(data?.latitude)
  const lng = parseFloat(data?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return {
    latitude: lat,
    longitude: lng,
    title: data?.title || normalizedKeyword,
    address: data?.address || ''
  }
}
