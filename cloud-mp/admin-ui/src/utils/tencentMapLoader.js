/**
 * 动态加载腾讯地图 JavaScript API GL（仅浏览器）
 * https://lbs.qq.com/webApi/javascriptGL/glGuide/glIndex
 */
const GL_SCRIPT_BASE = 'https://map.qq.com/api/gljs'

let loadPromise = null

function getKey() {
  const k = (import.meta.env.VITE_TENCENT_MAP_KEY || '').trim()
  return k
}

/**
 * @returns {Promise<typeof window.TMap>}
 */
export function loadTencentMapGL() {
  const key = getKey()
  if (!key) {
    return Promise.reject(new Error('未配置 VITE_TENCENT_MAP_KEY'))
  }
  if (typeof window !== 'undefined' && window.TMap) {
    return Promise.resolve(window.TMap)
  }
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const id = 'tencent-map-gl-js'
    if (document.getElementById(id)) {
      const check = () => {
        if (window.TMap) resolve(window.TMap)
        else setTimeout(check, 30)
      }
      check()
      return
    }
    const script = document.createElement('script')
    script.id = id
    script.charset = 'utf-8'
    script.src = `${GL_SCRIPT_BASE}?v=1.exp&key=${encodeURIComponent(key)}`
    script.onload = () => {
      if (window.TMap) resolve(window.TMap)
      else reject(new Error('脚本已加载但 TMap 不存在'))
    }
    script.onerror = () => reject(new Error('腾讯地图脚本加载失败'))
    document.head.appendChild(script)
  })

  return loadPromise
}

export function hasTencentMapKey() {
  return !!getKey()
}
