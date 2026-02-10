<template>
  <div>
    <div style="margin-bottom: 20px;">
      <el-button type="primary" icon="Plus" @click="showDialog()">新增轮播图</el-button>
    </div>

    <el-table :data="list" border v-loading="loading">
       <el-table-column label="图片" width="200">
           <template #default="{ row }">
               <el-image :src="row.image_url" style="width: 150px; height: 80px;" fit="cover" />
           </template>
       </el-table-column>
       <el-table-column prop="title" label="标题" />
       <el-table-column prop="link_url" label="跳转链接" />
       <el-table-column prop="sort" label="排序" width="100" />
       <el-table-column prop="status" label="状态" width="100">
           <template #default="{ row }">
               <el-tag :type="row.status === 1 ? 'success' : 'info'">{{ row.status === 1 ? '启用' : '禁用' }}</el-tag>
           </template>
       </el-table-column>
       <el-table-column label="操作" width="150">
           <template #default="{ row }">
               <el-button link type="primary" @click="showDialog(row)">编辑</el-button>
               <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
           </template>
       </el-table-column>
    </el-table>

    <!-- Dialog -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑轮播图' : '新增轮播图'" width="500px">
        <el-form label-width="80px">
            <el-form-item label="标题">
                <el-input v-model="form.title" />
            </el-form-item>
            <el-form-item label="图片URL">
                <el-input v-model="form.image_url" placeholder="请输入图片地址或上传" />
                <!-- Add upload component here if needed, consistent with Material design -->
            </el-form-item>
            <el-form-item label="跳转链接">
                <el-input v-model="form.link_url" />
            </el-form-item>
            <el-form-item label="排序">
                <el-input-number v-model="form.sort" :min="0" />
            </el-form-item>
            <el-form-item label="状态">
                <el-switch v-model="form.status" :active-value="1" :inactive-value="0" />
            </el-form-item>
        </el-form>
        <template #footer>
            <el-button @click="dialogVisible = false">取消</el-button>
            <el-button type="primary" @click="handleSubmit">保存</el-button>
        </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getBanners, createBanner, updateBanner, deleteBanner } from '@/api/content'
import { ElMessage, ElMessageBox } from 'element-plus'

const list = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const form = reactive({
    id: null,
    title: '',
    image_url: '',
    link_url: '',
    sort: 0,
    status: 1
})

const loadData = async () => {
    loading.value = true
    try {
        const res = await getBanners()
        list.value = res || []
    } catch (error) {
        console.error(error)
    } finally {
        loading.value = false
    }
}

const showDialog = (row = null) => {
    if (row) {
        Object.assign(form, row)
    } else {
        form.id = null
        form.title = ''
        form.image_url = ''
        form.link_url = ''
        form.sort = 0
        form.status = 1
    }
    dialogVisible.value = true
}

const handleSubmit = async () => {
    try {
        if (form.id) {
            await updateBanner(form.id, form)
        } else {
            await createBanner(form)
        }
        ElMessage.success('操作成功')
        dialogVisible.value = false
        loadData()
    } catch (error) {
        console.error(error)
    }
}

const handleDelete = (row) => {
    ElMessageBox.confirm('确认删除？', '提示', { type: 'warning' })
    .then(async () => {
        try {
            await deleteBanner(row.id)
            ElMessage.success('删除成功')
            loadData()
        } catch (error) {
            console.error(error)
        }
    })
}

onMounted(() => {
    loadData()
})
</script>
