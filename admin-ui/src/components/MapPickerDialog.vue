<template>
  <el-dialog
    :model-value="modelValue"
    title="地图选点"
    width="760px"
    class="map-picker-dialog"
    append-to-body
    destroy-on-close
    @update:model-value="$emit('update:modelValue', $event)"
    @opened="onDialogOpened"
    @closed="onDialogClosed"
  >
    <div v-if="!mapKeyReady" class="map-error">
      未配置 <code>VITE_TENCENT_MAP_KEY</code>，请在 admin-ui 的 <code>.env.local</code> 中配置并在腾讯控制台开启 JS API、设置域名白名单。
    </div>
    <template v-else>
      <div class="toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索地点（如：问兰药业、万达广场）"
          clearable
          @keyup.enter="doSearch"
        />
        <el-button type="primary" :loading="searching" @click="doSearch">搜索</el-button>
      </div>
      <div ref="mapContainerRef" class="tmap-wrap" />
      <div class="coords-line">
        当前坐标：
        <strong v-if="coordOk">{{ latDisplay }}, {{ lngDisplay }}</strong>
        <span v-else class="muted">点击地图选择位置</span>
      </div>
      <el-checkbox v-model="syncAddress">应用到表单时，同步更新省 / 市 / 区 / 详细地址（逆地理解析）</el-checkbox>
    </template>
    <template #footer>
      <el-button @click="close">取消</el-button>
      <el-button type="primary" :disabled="!coordOk" :loading="applying" @click="apply">应用到表单</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { loadTencentMapGL, hasTencentMapKey } from '@/utils/tencentMapLoader'
import { webGeocodeAddress, webPlaceSearch, webReverseGeocode } from '@/utils/tencentLbsWeb'

const MARKER_ICON = 'https://mapapi.qq.com/web/lbs/javascriptGL/demo/img/markerDefault.png'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  /** @type {{ province?: string, city?: string, district?: string, address?: string, longitude?: string|number, latitude?: string|number }} */
  seed: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['update:modelValue', 'confirm'])

const mapKeyReady = computed(() => hasTencentMapKey())
const mapContainerRef = ref(null)
const keyword = ref('')
const searching = ref(false)
const applying = ref(false)
const syncAddress = ref(true)

/** @type {import('vue').Ref<number|null>} */
const currentLat = ref(null)
/** @type {import('vue').Ref<number|null>} */
const currentLng = ref(null)

let map = null
let markerLayer = null
/** @type {((evt: any) => void) | null} */
let mapClickHandler = null

const coordOk = computed(() => Number.isFinite(currentLat.value) && Number.isFinite(currentLng.value))
const latDisplay = computed(() => (coordOk.value ? Number(currentLat.value).toFixed(6) : ''))
const lngDisplay = computed(() => (coordOk.value ? Number(currentLng.value).toFixed(6) : ''))

function buildSeedAddress() {
  const s = props.seed || {}
  return [s.province, s.city, s.district, s.address]
    .filter((x) => x != null && String(x).trim() !== '')
    .map((x) => String(x).trim())
    .join('')
}

function parseSeedCoords() {
  const s = props.seed || {}
  const la = parseFloat(s.latitude)
  const lo = parseFloat(s.longitude)
  if (Number.isFinite(la) && Number.isFinite(lo)) return { lat: la, lng: lo }
  return null
}

function destroyMap() {
  if (map && mapClickHandler) {
    try {
      map.off('click', mapClickHandler)
    } catch (_) {
      /* ignore */
    }
    mapClickHandler = null
  }
  try {
    if (map && typeof map.destroy === 'function') map.destroy()
  } catch (_) {
    /* ignore */
  }
  map = null
  markerLayer = null
  if (mapContainerRef.value) mapContainerRef.value.innerHTML = ''
}

function close() {
  emit('update:modelValue', false)
}

async function onDialogOpened() {
  keyword.value = ''
  currentLat.value = null
  currentLng.value = null
  if (!mapKeyReady.value) return
  try {
    const TMap = await loadTencentMapGL()
    await nextTick()
    if (!mapContainerRef.value) return

    let lat = 31.29834
    let lng = 120.58531
    const fromCoords = parseSeedCoords()
    if (fromCoords) {
      lat = fromCoords.lat
      lng = fromCoords.lng
    } else {
      const full = buildSeedAddress()
      if (full) {
        const g = await webGeocodeAddress(full)
        if (g) {
          lat = g.latitude
          lng = g.longitude
        }
      }
    }

    currentLat.value = lat
    currentLng.value = lng

    map = new TMap.Map(mapContainerRef.value, {
      center: new TMap.LatLng(lat, lng),
      zoom: 16,
      pitch: 0,
      rotation: 0
    })

    markerLayer = new TMap.MultiMarker({
      id: 'admin-pick-marker-layer',
      map,
      styles: {
        pick: new TMap.MarkerStyle({
          width: 28,
          height: 38,
          anchor: { x: 14, y: 34 },
          src: MARKER_ICON
        })
      },
      geometries: [
        {
          id: 'pick-main',
          styleId: 'pick',
          position: new TMap.LatLng(lat, lng)
        }
      ]
    })

    mapClickHandler = (evt) => {
      const ll = evt.latLng
      const nla = ll.getLat()
      const nlo = ll.getLng()
      currentLat.value = nla
      currentLng.value = nlo
      markerLayer.updateGeometries([
        {
          id: 'pick-main',
          styleId: 'pick',
          position: ll
        }
      ])
    }
    map.on('click', mapClickHandler)
  } catch (e) {
    console.error(e)
    ElMessage.error(e?.message || '地图加载失败，请检查 Key 与域名白名单')
    close()
  }
}

function onDialogClosed() {
  destroyMap()
}

async function doSearch() {
  if (!keyword.value?.trim()) {
    ElMessage.warning('请输入关键词')
    return
  }
  if (!map || !markerLayer) return
  searching.value = true
  try {
    const TMap = window.TMap
    const hit = await webPlaceSearch(keyword.value, {
      province: props.seed?.province,
      city: props.seed?.city,
      latitude: currentLat.value ?? undefined,
      longitude: currentLng.value ?? undefined
    })
    if (!hit) {
      ElMessage.warning('未搜索到地点，可换关键词或直接在地图上点击')
      return
    }
    currentLat.value = hit.latitude
    currentLng.value = hit.longitude
    const pos = new TMap.LatLng(hit.latitude, hit.longitude)
    map.setCenter(pos)
    map.setZoom(17)
    markerLayer.updateGeometries([{ id: 'pick-main', styleId: 'pick', position: pos }])
  } catch (e) {
    console.error(e)
    ElMessage.error('搜索失败')
  } finally {
    searching.value = false
  }
}

async function apply() {
  if (!coordOk.value) return
  applying.value = true
  try {
    const lat = Number(currentLat.value)
    const lng = Number(currentLng.value)
    const payload = { latitude: lat, longitude: lng }
    if (syncAddress.value) {
      const rev = await webReverseGeocode(lat, lng)
      if (rev) {
        payload.province = rev.province
        payload.city = rev.city
        payload.district = rev.district
        payload.address = rev.address
      }
    }
    emit('confirm', payload)
    close()
  } catch (e) {
    console.error(e)
    ElMessage.error('逆地理解析失败，仍可手动保存')
  } finally {
    applying.value = false
  }
}
</script>

<style scoped>
.map-error {
  padding: 16px;
  color: #c45656;
  line-height: 1.6;
  font-size: 14px;
}
.map-error code {
  background: #fef0f0;
  padding: 2px 6px;
  border-radius: 4px;
}
.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}
.toolbar .el-input {
  flex: 1;
}
.tmap-wrap {
  width: 100%;
  height: 420px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--el-border-color);
}
.coords-line {
  margin-top: 12px;
  font-size: 14px;
  margin-bottom: 10px;
}
.coords-line .muted {
  color: var(--el-text-color-secondary);
}
.el-checkbox {
  align-items: flex-start;
  white-space: normal;
  height: auto;
}
</style>
