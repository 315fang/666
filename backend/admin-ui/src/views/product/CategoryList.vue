<template>
  <div>
    <div style="margin-bottom: 20px;">
      <el-button type="primary" icon="Plus" @click="showDialog()">新增类目</el-button>
    </div>

    <el-table
      :data="categoryTree"
      row-key="id"
      border
      default-expand-all
    >
      <el-table-column prop="name" label="类目名称" />
      <el-table-column prop="icon_url" label="图标" width="100">
        <template #default="{ row }">
            <el-image v-if="row.icon_url" :src="row.icon_url" style="width: 40px; height: 40px" fit="cover" />
        </template>
      </el-table-column>
      <el-table-column prop="sort" label="排序" width="100" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
             <el-tag :type="row.status === 1 ? 'success' : 'info'">{{ row.status === 1 ? '启用' : '禁用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="250">
        <template #default="{ row }">
          <el-button link type="primary" @click="showDialog(null, row.id)">新增子类目</el-button>
          <el-button link type="primary" @click="showDialog(row)">编辑</el-button>
          <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Dialog -->
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑类目' : '新增类目'" width="500px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="父级类目">
            <el-tree-select
                v-model="form.parent_id"
                :data="categoryTree"
                :props="{ label: 'name', value: 'id', children: 'children' }"
                check-strictly
                placeholder="请选择父级类目（留空为顶级）"
                style="width: 100%"
            />
        </el-form-item>
        <el-form-item label="类目名称">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="图标URL">
          <el-input v-model="form.icon_url" />
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
        <el-button type="primary" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { getCategories, createCategory, updateCategory, deleteCategory } from '@/api/product'
import { ElMessage, ElMessageBox } from 'element-plus'

const categories = ref([])
const dialogVisible = ref(false)
const form = reactive({
  id: null,
  parent_id: null,
  name: '',
  icon_url: '',
  sort: 0,
  status: 1
})

const categoryTree = computed(() => {
    return buildTree(categories.value)
})

const buildTree = (items, parentId = null) => {
    const tree = []
    items.forEach(item => {
        if (item.parent_id === parentId) {
            const children = buildTree(items, item.id)
            if (children.length) {
                item.children = children
            }
            tree.push(item)
        }
    })
    return tree
}

const loadData = async () => {
    try {
        const res = await getCategories()
        categories.value = res || []
    } catch (error) {
        console.error(error)
    }
}

const showDialog = (row = null, parentId = null) => {
    if (row) {
        Object.assign(form, row)
    } else {
        form.id = null
        form.name = ''
        form.icon_url = ''
        form.sort = 0
        form.status = 1
        form.parent_id = parentId
    }
    dialogVisible.value = true
}

const submitForm = async () => {
    try {
        if (form.id) {
            await updateCategory(form.id, form)
            ElMessage.success('更新成功')
        } else {
            await createCategory(form)
            ElMessage.success('创建成功')
        }
        dialogVisible.value = false
        loadData()
    } catch (error) {
        console.error(error)
    }
}

const handleDelete = (row) => {
    ElMessageBox.confirm('确认删除该类目吗？', '提示', {
        type: 'warning'
    }).then(async () => {
        try {
            await deleteCategory(row.id)
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
