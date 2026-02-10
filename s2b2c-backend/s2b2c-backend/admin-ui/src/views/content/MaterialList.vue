<template>
  <div>
    <!-- Material Upload and List -->
     <div style="margin-bottom: 20px;">
        <el-upload
            action="/admin/api/materials/upload"
            :show-file-list="false"
            :on-success="handleUploadSuccess"
            :headers="uploadHeaders"
            name="file"
            accept="image/*,video/*"
        >
            <el-button type="primary" icon="Upload">上传素材</el-button>
        </el-upload>
     </div>

    <el-tabs v-model="activeTab" @tab-change="loadData">
        <el-tab-pane label="全部" name="all" />
        <el-tab-pane label="图片" name="image" />
        <el-tab-pane label="视频" name="video" />
    </el-tabs>

     <el-row :gutter="20" v-loading="loading">
         <el-col :span="6" v-for="item in list" :key="item.id" style="margin-bottom: 20px;">
             <el-card :body-style="{ padding: '0px' }">
                 <div class="media-container" style="height: 150px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #f5f7fa;">
                     <el-image 
                        v-if="item.type === 'image'" 
                        :src="item.url" 
                        fit="contain" 
                        style="width: 100%; height: 100%;"
                        :preview-src-list="[item.url]"
                     />
                     <video v-else :src="item.url" style="max-width: 100%; max-height: 100%;" controls />
                 </div>
                 <div style="padding: 10px;">
                     <div style="font-size: 12px; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ item.name }}</div>
                      <div style="margin-top: 10px; text-align: right;">
                          <el-button type="danger" link icon="Delete" @click="handleDelete(item)">删除</el-button>
                      </div>
                 </div>
             </el-card>
         </el-col>
     </el-row>

     <div style="text-align: right; margin-top: 20px;">
        <el-pagination
            background
            layout="prev, pager, next"
            :total="total"
            :page-size="query.limit"
            @current-change="handlePageChange"
        />
     </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { getMaterials, deleteMaterial } from '@/api/content'
import { ElMessage, ElMessageBox } from 'element-plus'

const list = ref([])
const total = ref(0)
const loading = ref(false)
const activeTab = ref('all')
const query = reactive({
    page: 1,
    limit: 12,
    type: ''
})

const uploadHeaders = computed(() => {
    return {
        Authorization: `Bearer ${localStorage.getItem('token')}`
    }
})

const loadData = async () => {
    loading.value = true
    try {
        const params = { ...query }
        if (activeTab.value !== 'all') {
            params.type = activeTab.value
        } else {
            params.type = ''
        }
        
        const res = await getMaterials(params)
        list.value = res.list
        total.value = res.pagination.total
    } catch (error) {
        console.error(error)
    } finally {
        loading.value = false
    }
}

const handleUploadSuccess = (res) => {
    if (res.code === 0) {
        ElMessage.success('上传成功')
        loadData()
    } else {
        ElMessage.error(res.message || '上传失败')
    }
}

const handleDelete = (item) => {
    ElMessageBox.confirm('确认删除该素材？', '提示', { type: 'warning' })
    .then(async () => {
        try {
            await deleteMaterial(item.id)
            ElMessage.success('删除成功')
            loadData()
        } catch (error) {
            console.error(error)
        }
    })
}

const handlePageChange = (val) => {
    query.page = val
    loadData()
}

onMounted(() => {
    loadData()
})
</script>
