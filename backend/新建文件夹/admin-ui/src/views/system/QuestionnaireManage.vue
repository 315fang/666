<template>
    <div class="questionnaire-page">
        <!-- 页面头部 -->
        <div class="page-header">
            <div class="header-left">
                <h2>问卷管理</h2>
                <p class="subtitle">管理邀请问卷模板和查看提交记录</p>
            </div>
            <el-button type="primary" @click="showCreateDialog">
                <el-icon><Plus /></el-icon> 新建问卷模板
            </el-button>
        </div>

        <!-- Tabs -->
        <el-tabs v-model="activeTab" class="main-tabs">
            <!-- 问卷模板列表 -->
            <el-tab-pane label="问卷模板" name="templates">
                <div class="card-list" v-loading="templatesLoading">
                    <div v-if="templates.length === 0" class="empty-state">
                        <el-empty description="暂无问卷模板，请点击上方创建" />
                    </div>
                    <div v-for="item in templates" :key="item.id" class="template-card" :class="{ active: item.is_active }">
                        <div class="card-header">
                            <div class="card-title">
                                <span>{{ item.title }}</span>
                                <el-tag v-if="item.is_active" type="success" size="small">启用中</el-tag>
                                <el-tag v-else type="info" size="small">未启用</el-tag>
                            </div>
                            <div class="card-actions">
                                <el-button size="small" text type="primary" @click="editTemplate(item)">编辑</el-button>
                                <el-button v-if="!item.is_active" size="small" text type="success" @click="activateTemplate(item.id)">启用</el-button>
                                <el-button size="small" text type="danger" @click="deleteTemplate(item.id)">删除</el-button>
                            </div>
                        </div>
                        <div class="card-desc">{{ item.description || '无描述' }}</div>
                        <div class="card-meta">
                            <span>版本: v{{ item.version }}</span>
                            <span>字段数: {{ (item.fields || []).length }}</span>
                            <span>提交数: {{ item.submission_count || 0 }}</span>
                            <span>创建: {{ formatDate(item.createdAt) }}</span>
                        </div>
                        <!-- 字段预览 -->
                        <div class="fields-preview">
                            <div v-for="(f, fi) in (item.fields || []).slice(0, 5)" :key="fi" class="field-tag">
                                <el-tag size="small" :type="f.required ? 'danger' : 'info'">
                                    {{ f.label }} ({{ fieldTypeLabel(f.type) }})
                                </el-tag>
                            </div>
                            <span v-if="(item.fields || []).length > 5" class="more-tag">+{{ item.fields.length - 5 }} more</span>
                        </div>
                    </div>
                </div>
            </el-tab-pane>

            <!-- 提交记录 -->
            <el-tab-pane label="提交记录" name="submissions">
                <div class="filter-bar">
                    <el-select v-model="filter.questionnaire_id" placeholder="筛选问卷" clearable size="default" style="width: 200px">
                        <el-option v-for="t in templates" :key="t.id" :label="t.title" :value="t.id" />
                    </el-select>
                    <el-button @click="loadSubmissions">查询</el-button>
                </div>

                <el-table :data="submissions" v-loading="submissionsLoading" border stripe style="width: 100%">
                    <el-table-column prop="id" label="ID" width="60" />
                    <el-table-column label="问卷" width="150">
                        <template #default="{ row }">
                            {{ row.questionnaire?.title || '-' }}
                        </template>
                    </el-table-column>
                    <el-table-column label="邀请人" width="150">
                        <template #default="{ row }">
                            <div class="user-cell" v-if="row.inviter">
                                <el-avatar :size="24" :src="row.inviter.avatar_url" />
                                <span>{{ row.inviter.nickname }}</span>
                            </div>
                            <span v-else>-</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="填写人" width="150">
                        <template #default="{ row }">
                            <div class="user-cell" v-if="row.submitter">
                                <el-avatar :size="24" :src="row.submitter.avatar_url" />
                                <span>{{ row.submitter.nickname }}</span>
                            </div>
                            <span v-else>-</span>
                        </template>
                    </el-table-column>
                    <el-table-column label="绑定团队" width="100">
                        <template #default="{ row }">
                            <el-tag :type="row.bound_team ? 'success' : 'warning'" size="small">
                                {{ row.bound_team ? '已绑定' : '未绑定' }}
                            </el-tag>
                        </template>
                    </el-table-column>
                    <el-table-column label="答案内容" min-width="250">
                        <template #default="{ row }">
                            <div class="answers-preview">
                                <template v-for="(val, key) in (row.answers || {})" :key="key">
                                    <span class="answer-item"><b>{{ key }}:</b> {{ Array.isArray(val) ? val.join(', ') : val }}</span>
                                </template>
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column label="提交时间" width="170">
                        <template #default="{ row }">
                            {{ formatDate(row.createdAt) }}
                        </template>
                    </el-table-column>
                </el-table>

                <!-- 分页 -->
                <div class="pagination-box" v-if="pagination.total > 0">
                    <el-pagination
                        v-model:current-page="pagination.page"
                        :page-size="pagination.limit"
                        :total="pagination.total"
                        layout="total, prev, pager, next"
                        @current-change="loadSubmissions"
                    />
                </div>
            </el-tab-pane>
        </el-tabs>

        <!-- 创建/编辑问卷弹窗 -->
        <el-dialog
            v-model="dialogVisible"
            :title="editingId ? '编辑问卷模板' : '新建问卷模板'"
            width="700px"
            :close-on-click-modal="false"
        >
            <el-form label-width="80px">
                <el-form-item label="标题" required>
                    <el-input v-model="form.title" placeholder="请输入问卷标题" />
                </el-form-item>
                <el-form-item label="描述">
                    <el-input v-model="form.description" type="textarea" :rows="2" placeholder="问卷描述（选填）" />
                </el-form-item>
                <el-form-item label="是否启用">
                    <el-switch v-model="form.is_active" />
                </el-form-item>

                <!-- 字段编辑器 -->
                <el-divider>问卷字段</el-divider>
                <div class="fields-editor">
                    <div v-for="(field, index) in form.fields" :key="index" class="field-editor-item">
                        <div class="field-editor-row">
                            <el-input v-model="field.key" placeholder="字段key" style="width: 120px" size="small" />
                            <el-input v-model="field.label" placeholder="显示名称" style="width: 140px" size="small" />
                            <el-select v-model="field.type" placeholder="类型" style="width: 130px" size="small">
                                <el-option label="文本" value="text" />
                                <el-option label="手机号" value="phone" />
                                <el-option label="多行文本" value="textarea" />
                                <el-option label="单选" value="radio" />
                                <el-option label="多选" value="checkbox" />
                                <el-option label="下拉选择" value="select" />
                                <el-option label="地区选择" value="region" />
                            </el-select>
                            <el-checkbox v-model="field.required" size="small">必填</el-checkbox>
                            <el-button size="small" type="danger" text @click="removeField(index)">
                                <el-icon><Delete /></el-icon>
                            </el-button>
                        </div>
                        <div v-if="['radio', 'checkbox', 'select'].includes(field.type)" class="field-options-row">
                            <el-input
                                v-model="field.optionsStr"
                                placeholder="选项（用逗号分隔）"
                                size="small"
                                style="flex: 1"
                                @blur="parseOptions(field)"
                            />
                        </div>
                        <div class="field-placeholder-row">
                            <el-input v-model="field.placeholder" placeholder="占位提示文字" size="small" />
                        </div>
                    </div>
                    <el-button type="primary" text @click="addField">
                        <el-icon><Plus /></el-icon> 添加字段
                    </el-button>
                </div>
            </el-form>

            <template #footer>
                <el-button @click="dialogVisible = false">取消</el-button>
                <el-button type="primary" @click="saveTemplate" :loading="saving">保存</el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import { Plus, Delete } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import request from '@/utils/request';

const activeTab = ref('templates');

// ===== Templates =====
const templates = ref([]);
const templatesLoading = ref(false);

async function loadTemplates() {
    templatesLoading.value = true;
    try {
        const res = await request.get('/admin/api/questionnaires');
        if (res.code === 0) {
            templates.value = res.data || [];
        }
    } catch (e) {
        console.error('加载问卷列表失败:', e);
    } finally {
        templatesLoading.value = false;
    }
}

// ===== Submissions =====
const submissions = ref([]);
const submissionsLoading = ref(false);
const filter = reactive({
    questionnaire_id: ''
});
const pagination = reactive({
    page: 1,
    limit: 20,
    total: 0
});

async function loadSubmissions() {
    submissionsLoading.value = true;
    try {
        const params = {
            page: pagination.page,
            limit: pagination.limit
        };
        if (filter.questionnaire_id) params.questionnaire_id = filter.questionnaire_id;

        const res = await request.get('/admin/api/questionnaire-submissions', { params });
        if (res.code === 0) {
            submissions.value = res.data.list || [];
            pagination.total = res.data.pagination?.total || 0;
        }
    } catch (e) {
        console.error('加载提交记录失败:', e);
    } finally {
        submissionsLoading.value = false;
    }
}

// ===== Template Dialog =====
const dialogVisible = ref(false);
const editingId = ref(null);
const saving = ref(false);
const form = reactive({
    title: '',
    description: '',
    is_active: true,
    fields: []
});

function showCreateDialog() {
    editingId.value = null;
    form.title = '';
    form.description = '';
    form.is_active = true;
    form.fields = [
        { key: 'name', label: '姓名', type: 'text', required: true, placeholder: '请输入您的真实姓名', optionsStr: '' },
        { key: 'phone', label: '手机号', type: 'phone', required: true, placeholder: '请输入您的手机号码', optionsStr: '' }
    ];
    dialogVisible.value = true;
}

function editTemplate(item) {
    editingId.value = item.id;
    form.title = item.title;
    form.description = item.description || '';
    form.is_active = item.is_active;
    form.fields = (item.fields || []).map(f => ({
        ...f,
        optionsStr: (f.options || []).join(', ')
    }));
    dialogVisible.value = true;
}

function addField() {
    form.fields.push({
        key: '',
        label: '',
        type: 'text',
        required: false,
        placeholder: '',
        optionsStr: ''
    });
}

function removeField(index) {
    form.fields.splice(index, 1);
}

function parseOptions(field) {
    if (field.optionsStr) {
        field.options = field.optionsStr.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    }
}

async function saveTemplate() {
    if (!form.title) {
        ElMessage.warning('请输入问卷标题');
        return;
    }
    if (form.fields.length === 0) {
        ElMessage.warning('至少需要一个问卷字段');
        return;
    }

    // 确保所有字段有key和label
    for (const f of form.fields) {
        if (!f.key || !f.label) {
            ElMessage.warning('所有字段必须填写 key 和 显示名称');
            return;
        }
        // 解析选项
        if (['radio', 'checkbox', 'select'].includes(f.type) && f.optionsStr) {
            f.options = f.optionsStr.split(/[,，]/).map(s => s.trim()).filter(Boolean);
        }
    }

    const payload = {
        title: form.title,
        description: form.description,
        is_active: form.is_active,
        fields: form.fields.map(({ optionsStr, ...rest }) => rest)
    };

    saving.value = true;
    try {
        let res;
        if (editingId.value) {
            res = await request.put(`/admin/api/questionnaires/${editingId.value}`, payload);
        } else {
            res = await request.post('/admin/api/questionnaires', payload);
        }
        if (res.code === 0) {
            ElMessage.success(editingId.value ? '更新成功' : '创建成功');
            dialogVisible.value = false;
            loadTemplates();
        } else {
            ElMessage.error(res.message || '操作失败');
        }
    } catch (e) {
        ElMessage.error('操作失败');
    } finally {
        saving.value = false;
    }
}

async function deleteTemplate(id) {
    try {
        await ElMessageBox.confirm('确定删除该问卷模板吗？有提交记录的问卷无法删除。', '确认删除');
        const res = await request.delete(`/admin/api/questionnaires/${id}`);
        if (res.code === 0) {
            ElMessage.success('删除成功');
            loadTemplates();
        } else {
            ElMessage.error(res.message || '删除失败');
        }
    } catch (e) {
        if (e !== 'cancel') ElMessage.error('删除失败');
    }
}

async function activateTemplate(id) {
    try {
        const res = await request.put(`/admin/api/questionnaires/${id}/activate`);
        if (res.code === 0) {
            ElMessage.success('已设为启用');
            loadTemplates();
        }
    } catch (e) {
        ElMessage.error('操作失败');
    }
}

// ===== Helpers =====
function fieldTypeLabel(type) {
    const map = { text: '文本', phone: '手机号', textarea: '多行文本', radio: '单选', checkbox: '多选', select: '下拉', region: '地区' };
    return map[type] || type;
}

function formatDate(str) {
    if (!str) return '-';
    return new Date(str).toLocaleString('zh-CN');
}

onMounted(() => {
    loadTemplates();
    loadSubmissions();
});
</script>

<style scoped>
.questionnaire-page {
    padding: 20px;
}

.page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
}

.page-header h2 {
    margin: 0;
    font-size: 22px;
    color: #1a1a2e;
}

.subtitle {
    margin: 4px 0 0;
    color: #999;
    font-size: 14px;
}

.main-tabs {
    background: #fff;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.05);
}

/* Template Cards */
.card-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.template-card {
    border: 1px solid #ebeef5;
    border-radius: 12px;
    padding: 20px;
    transition: all 0.2s;
}

.template-card.active {
    border-color: #67c23a;
    background: #f0f9eb;
}

.template-card:hover {
    box-shadow: 0 4px 16px rgba(0,0,0,0.08);
}

.card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.card-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
    color: #333;
}

.card-desc {
    font-size: 14px;
    color: #888;
    margin-bottom: 12px;
}

.card-meta {
    display: flex;
    gap: 16px;
    font-size: 13px;
    color: #999;
    margin-bottom: 12px;
}

.fields-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
}

.more-tag {
    color: #999;
    font-size: 12px;
}

/* Submissions */
.filter-bar {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
}

.user-cell {
    display: flex;
    align-items: center;
    gap: 8px;
}

.answers-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 13px;
}

.answer-item {
    background: #f5f7fa;
    padding: 2px 8px;
    border-radius: 4px;
}

.pagination-box {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
}

/* Field Editor */
.fields-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.field-editor-item {
    border: 1px solid #ebeef5;
    border-radius: 8px;
    padding: 12px;
    background: #fafafa;
}

.field-editor-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.field-options-row,
.field-placeholder-row {
    margin-top: 8px;
}

.empty-state {
    padding: 60px 0;
    text-align: center;
}
</style>
