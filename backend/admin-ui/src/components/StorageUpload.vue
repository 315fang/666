<!--
  CosUpload — 自动上传到后端配置存储（COS/OSS/七牛/本地）
  使用示例：
    <cos-upload v-model="form.coverImage" />
    <cos-upload v-model="images" :multiple="true" :limit="9" folder="products" />

  Props:
    modelValue: string | string[]  当前图片 URL（单图/多图）
    multiple:   boolean            是否多图（默认 false）
    limit:      number             多图最大数量（默认 9）
    folder:     string             存储目录（默认 products）
    width/height: string           预览图尺寸（默认 80px / 80px）

  Emits:
    update:modelValue — 上传完成后返回 URL（单图为 string，多图为 string[]）
-->
<template>
  <div class="cos-upload">
    <!-- 多图模式 -->
    <template v-if="multiple">
      <div class="image-list">
        <div
          v-for="(url, index) in valueList"
          :key="url + index"
          class="image-item"
          :style="{ width: width, height: height }"
        >
          <el-image :src="url" fit="cover" class="preview-img" :preview-src-list="valueList" />
          <div class="image-remove" @click="removeImage(index)">
            <el-icon><Close /></el-icon>
          </div>
        </div>
        <el-upload
          v-if="valueList.length < limit"
          class="upload-trigger"
          :style="{ width, height }"
          :action="uploadAction"
          :headers="uploadHeaders"
          :show-file-list="false"
          :on-success="onSuccess"
          :on-error="onError"
          :before-upload="beforeUpload"
          accept="image/*"
        >
          <div class="upload-btn">
            <el-icon :size="20" color="#c0c4cc"><Plus /></el-icon>
          </div>
        </el-upload>
      </div>
      <div class="upload-hint">{{ valueList.length }}/{{ limit }}，支持 jpg/png/webp/gif，最大 10MB</div>
    </template>

    <!-- 单图模式 -->
    <template v-else>
      <el-upload
        :action="uploadAction"
        :headers="uploadHeaders"
        :show-file-list="false"
        :on-success="onSuccess"
        :on-error="onError"
        :before-upload="beforeUpload"
        accept="image/*"
      >
        <div
          v-if="modelValue"
          class="single-preview"
          :style="{ width, height }"
        >
          <el-image :src="modelValue" fit="cover" class="preview-img" />
          <div class="single-overlay">
            <el-icon color="white" :size="20"><Edit /></el-icon>
            <span>替换</span>
          </div>
        </div>
        <div v-else class="upload-placeholder" :style="{ width, height }">
          <el-icon :size="24" color="#c0c4cc"><Plus /></el-icon>
          <span class="upload-placeholder-text">上传图片</span>
        </div>
      </el-upload>
      <div v-if="modelValue" class="url-bar">
        <el-input :value="modelValue" readonly size="small" placeholder="图片 URL">
          <template #append>
            <el-button @click="clearImage" type="danger" size="small">删除</el-button>
          </template>
        </el-input>
      </div>
    </template>

    <!-- 上传中蒙层 -->
    <div v-if="uploading" class="uploading-mask">
      <el-icon class="is-loading"><Loading /></el-icon>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useUserStore } from '@/store/user'

const props = defineProps({
  modelValue: { type: [String, Array], default: '' },
  multiple: { type: Boolean, default: false },
  limit: { type: Number, default: 9 },
  folder: { type: String, default: 'products' },
  width: { type: String, default: '80px' },
  height: { type: String, default: '80px' }
})

const emit = defineEmits(['update:modelValue'])

const uploading = ref(false)
const userStore = useUserStore()

const uploadAction = computed(() => {
  const base = import.meta.env.VITE_API_BASE_URL || '/admin/api'
  return `${base}/upload?folder=${props.folder}`
})
const uploadHeaders = computed(() => ({ Authorization: `Bearer ${userStore.token}` }))

const valueList = computed(() => {
  if (!props.multiple) return []
  return Array.isArray(props.modelValue) ? props.modelValue : (props.modelValue ? [props.modelValue] : [])
})

const beforeUpload = (file) => {
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.error('图片大小不能超过 10MB')
    return false
  }
  const ok = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'].includes(file.type)
  if (!ok) {
    ElMessage.error('仅支持 jpg / png / gif / webp / svg')
    return false
  }
  uploading.value = true
  return true
}

const onSuccess = (response) => {
  uploading.value = false
  if (response.code === 0) {
    const url = response.data?.url || ''
    if (props.multiple) {
      const list = [...valueList.value, url]
      emit('update:modelValue', list)
    } else {
      emit('update:modelValue', url)
    }
    ElMessage.success('上传成功')
  } else {
    ElMessage.error(response.message || '上传失败')
  }
}

const onError = () => {
  uploading.value = false
  ElMessage.error('上传失败，请检查存储配置')
}

const removeImage = (index) => {
  const list = [...valueList.value]
  list.splice(index, 1)
  emit('update:modelValue', list)
}

const clearImage = () => {
  emit('update:modelValue', '')
}
</script>

<style scoped>
.cos-upload { position: relative; display: inline-block; }

/* 多图列表 */
.image-list { display: flex; flex-wrap: wrap; gap: 8px; }
.image-item {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #e4e7ed;
  flex-shrink: 0;
}
.image-item .preview-img { width: 100%; height: 100%; display: block; }
.image-remove {
  position: absolute;
  top: 2px; right: 2px;
  width: 18px; height: 18px;
  background: rgba(0,0,0,.5);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  color: #fff;
  font-size: 10px;
  opacity: 0;
  transition: opacity 0.15s;
}
.image-item:hover .image-remove { opacity: 1; }

.upload-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.upload-btn {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed #e4e7ed;
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.upload-btn:hover { border-color: #409eff; }
:deep(.el-upload) { display: block; }
:deep(.upload-trigger .el-upload) { width: 100%; height: 100%; }

.upload-hint { font-size: 11px; color: #c0c4cc; margin-top: 4px; }

/* 单图 */
.single-preview {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid #e4e7ed;
  flex-shrink: 0;
}
.single-preview .preview-img { width: 100%; height: 100%; display: block; }
.single-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
  color: white;
  font-size: 12px;
}
.single-preview:hover .single-overlay { opacity: 1; }
.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px dashed #e4e7ed;
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.15s;
  background: #fafafa;
}
.upload-placeholder:hover { border-color: #409eff; }
.upload-placeholder-text { font-size: 11px; color: #c0c4cc; }

.url-bar { margin-top: 6px; max-width: 320px; }

/* 上传中遮罩 */
.uploading-mask {
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,.8);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  z-index: 10;
}
</style>
