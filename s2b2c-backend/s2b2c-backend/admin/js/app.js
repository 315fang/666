// S2B2C 管理后台 - 主应用
const { createApp, ref, reactive, onMounted, computed } = Vue;

// API 基础配置
const API_BASE = window.location.origin;

// 创建应用
const app = createApp({
    setup() {
        // 状态
        const isLoggedIn = ref(false);
        const adminInfo = ref({});
        const currentPage = ref('dashboard');
        const loading = ref(false);
        const loginLoading = ref(false);

        // 登录表单
        const loginForm = reactive({ username: '', password: '' });

        // 数据列表
        const stats = reactive({ todayOrders: 0, todaySales: 0, totalUsers: 0, pendingShip: 0, pendingWithdraw: 0, pendingRefund: 0 });
        const products = ref([]);
        const orders = ref([]);
        const users = ref([]);
        const banners = ref([]);
        const withdrawals = ref([]);
        const refunds = ref([]);
        const distributors = ref([]);
        const dealers = ref([]);

        // 筛选条件
        const distributorFilter = ref('');
        const dealerFilter = ref('');
        const categoryFilter = ref('');
        const productTab = ref('list');
        const contentTab = ref('banners');
        const materialTypeFilter = ref('');

        // 分页
        const pagination = reactive({ page: 1, limit: 10, total: 0 });

        // 对话框
        const productDialogVisible = ref(false);
        const bannerDialogVisible = ref(false);
        const shipDialogVisible = ref(false);
        const categoryDialogVisible = ref(false);
        const materialDialogVisible = ref(false);

        // 表单
        const productForm = reactive({ id: null, name: '', retail_price: 0, member_price: 0, stock: 0, description: '', category_id: null });
        const bannerForm = reactive({ id: null, title: '', image_url: '', link_url: '', sort: 0 });
        const shipForm = reactive({ orderId: null, express_company: '', express_no: '' });
        const categoryForm = reactive({ id: null, name: '', parent_id: null, icon_url: '', sort: 0, status: 1 });
        const categories = ref([]);
        const materials = ref([]);
        const materialForm = reactive({ id: null, title: '', type: 'image', url: '', content: '' });

        // API 请求封装
        const request = async (url, options = {}) => {
            const token = localStorage.getItem('admin_token');
            const headers = { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
            try {
                const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
                const data = await res.json();
                if (res.status === 401) { handleLogout(); return null; }
                return data;
            } catch (e) {
                console.error('请求失败:', e);
                ElementPlus.ElMessage.error('网络请求失败');
                return null;
            }
        };

        // 登录
        const handleLogin = async () => {
            if (!loginForm.username || !loginForm.password) {
                ElementPlus.ElMessage.warning('请输入用户名和密码');
                return;
            }
            loginLoading.value = true;
            const res = await request('/admin/api/login', {
                method: 'POST',
                body: JSON.stringify(loginForm)
            });
            loginLoading.value = false;
            if (res && res.code === 0) {
                localStorage.setItem('admin_token', res.data.token);
                adminInfo.value = res.data.admin;
                isLoggedIn.value = true;
                loadDashboard();
                ElementPlus.ElMessage.success('登录成功');
            } else {
                ElementPlus.ElMessage.error(res?.message || '登录失败');
            }
        };

        // 退出
        const handleLogout = () => {
            localStorage.removeItem('admin_token');
            isLoggedIn.value = false;
            adminInfo.value = {};
            loginForm.username = '';
            loginForm.password = '';
        };

        // 菜单切换
        const handleMenuSelect = (index) => {
            currentPage.value = index;
            pagination.page = 1;
            switch (index) {
                case 'dashboard': loadDashboard(); break;
                case 'products': loadProducts(); break;
                case 'orders': loadOrders(); break;
                case 'users': loadUsers(); break;
                case 'distribution': loadDistributors(); break;
                case 'dealers': loadDealers(); break;
                case 'content': loadBanners(); break;
                case 'withdrawals': loadWithdrawals(); break;
                case 'refunds': loadRefunds(); break;
            }
        };

        // 加载仪表盘
        const loadDashboard = async () => {
            const [ordersRes, usersRes, withdrawRes, refundRes] = await Promise.all([
                request('/admin/api/orders?limit=1'),
                request('/admin/api/users?limit=1'),
                request('/admin/api/withdrawals?status=pending&limit=1'),
                request('/admin/api/refunds?status=pending&limit=1')
            ]);
            stats.todayOrders = ordersRes?.data?.pagination?.total || 0;
            stats.todaySales = ordersRes?.data?.todaySales || 0;
            stats.totalUsers = usersRes?.data?.pagination?.total || 0;
            stats.pendingWithdraw = withdrawRes?.data?.pagination?.total || 0;
            stats.pendingRefund = refundRes?.data?.pagination?.total || 0;
            stats.pendingShip = ordersRes?.data?.pendingShip || 0;
        };

        // 加载商品
        const loadProducts = async (page = 1) => {
            loading.value = true;
            pagination.page = page;
            let url = `/admin/api/products?page=${page}&limit=${pagination.limit}`;
            if (categoryFilter.value) url += `&category_id=${categoryFilter.value}`;
            const res = await request(url);
            loading.value = false;
            if (res && res.code === 0) {
                products.value = res.data.list || res.data;
                pagination.total = res.data.pagination?.total || 0;
            }
            // 确保类目列表已加载
            if (!categories.value.length) loadCategories();
        };

        // 加载订单
        const loadOrders = async (page = 1) => {
            loading.value = true;
            pagination.page = page;
            const res = await request(`/admin/api/orders?page=${page}&limit=${pagination.limit}`);
            loading.value = false;
            if (res && res.code === 0) {
                orders.value = res.data.list || res.data;
                pagination.total = res.data.pagination?.total || 0;
            }
        };

        // 加载用户
        const loadUsers = async (page = 1) => {
            loading.value = true;
            pagination.page = page;
            const res = await request(`/admin/api/users?page=${page}&limit=${pagination.limit}`);
            loading.value = false;
            if (res && res.code === 0) {
                users.value = res.data.list || res.data;
                pagination.total = res.data.pagination?.total || 0;
            }
        };

        // 加载轮播图
        const loadBanners = async () => {
            loading.value = true;
            const res = await request('/admin/api/banners');
            loading.value = false;
            if (res && res.code === 0) {
                banners.value = res.data.list || res.data || [];
            }
        };

        // 加载提现
        const loadWithdrawals = async (page = 1) => {
            loading.value = true;
            pagination.page = page;
            const res = await request(`/admin/api/withdrawals?page=${page}&limit=${pagination.limit}`);
            loading.value = false;
            if (res && res.code === 0) {
                withdrawals.value = res.data.list || res.data;
                pagination.total = res.data.pagination?.total || 0;
            }
        };

        // 加载售后
        const loadRefunds = async (page = 1) => {
            loading.value = true;
            pagination.page = page;
            const res = await request(`/admin/api/refunds?page=${page}&limit=${pagination.limit}`);
            loading.value = false;
            if (res && res.code === 0) {
                refunds.value = res.data.list || res.data;
                pagination.total = res.data.pagination?.total || 0;
            }
        };

        // 加载分销员列表 (role_level >= 1 的用户)
        const loadDistributors = async (page = 1) => {
            loading.value = true;
            pagination.page = page;
            let url = `/admin/api/users?page=${page}&limit=${pagination.limit}`;
            if (distributorFilter.value) url += `&role_level=${distributorFilter.value}`;
            else url += '&role_level=1'; // 默认只显示会员及以上
            const res = await request(url);
            loading.value = false;
            if (res && res.code === 0) {
                distributors.value = res.data.list || res.data;
                pagination.total = res.data.pagination?.total || 0;
            }
        };

        // 加载经销商列表
        const loadDealers = async (page = 1) => {
            loading.value = true;
            pagination.page = page;
            let url = `/admin/api/dealers?page=${page}&limit=${pagination.limit}`;
            if (dealerFilter.value) url += `&status=${dealerFilter.value}`;
            const res = await request(url);
            loading.value = false;
            if (res && res.code === 0) {
                dealers.value = res.data.list || res.data || [];
                pagination.total = res.data.pagination?.total || 0;
            }
        };

        // 查看分销员详情
        const showDistributorDetail = async (user) => {
            const res = await request(`/admin/api/users/${user.id}`);
            if (res && res.code === 0) {
                const data = res.data;
                ElementPlus.ElMessageBox.alert(
                    `<div style="line-height:2">
                        <p><b>昵称:</b> ${data.nickname}</p>
                        <p><b>等级:</b> ${getRoleText(data.role_level)}</p>
                        <p><b>余额:</b> ¥${data.balance || 0}</p>
                        <p><b>订单数:</b> ${data.stats?.orderCount || 0}</p>
                        <p><b>团队人数:</b> ${data.stats?.teamCount || 0}</p>
                        <p><b>累计佣金:</b> ¥${data.stats?.totalCommission || 0}</p>
                    </div>`,
                    '分销员详情',
                    { dangerouslyUseHTMLString: true }
                );
            }
        };

        // 调整用户等级
        const changeUserRole = async (user, newRole) => {
            const res = await request(`/admin/api/users/${user.id}/role`, {
                method: 'PUT',
                body: JSON.stringify({ role_level: newRole })
            });
            if (res && res.code === 0) {
                loadDistributors(pagination.page);
                ElementPlus.ElMessage.success('等级调整成功');
            } else {
                ElementPlus.ElMessage.error(res?.message || '操作失败');
            }
        };

        // 查看经销商详情
        const showDealerDetail = (dealer) => {
            ElementPlus.ElMessageBox.alert(
                `<div style="line-height:2">
                    <p><b>公司名称:</b> ${dealer.company_name}</p>
                    <p><b>联系人:</b> ${dealer.contact_name}</p>
                    <p><b>电话:</b> ${dealer.contact_phone}</p>
                    <p><b>等级:</b> ${dealer.level || 1}级</p>
                    <p><b>状态:</b> ${getDealerStatusText(dealer.status)}</p>
                    <p><b>申请时间:</b> ${new Date(dealer.createdAt).toLocaleString()}</p>
                </div>`,
                '经销商详情',
                { dangerouslyUseHTMLString: true }
            );
        };

        // 通过经销商
        const approveDealer = async (dealer) => {
            const res = await request(`/admin/api/dealers/${dealer.id}/approve`, { method: 'PUT' });
            if (res && res.code === 0) {
                loadDealers(pagination.page);
                ElementPlus.ElMessage.success('已通过审核');
            }
        };

        // 拒绝经销商
        const rejectDealer = async (dealer) => {
            const { value } = await ElementPlus.ElMessageBox.prompt('请输入拒绝原因', '拒绝经销商');
            const res = await request(`/admin/api/dealers/${dealer.id}/reject`, {
                method: 'PUT',
                body: JSON.stringify({ reason: value })
            });
            if (res && res.code === 0) {
                loadDealers(pagination.page);
                ElementPlus.ElMessage.success('已拒绝');
            }
        };

        // 获取角色等级颜色
        const getRoleLevelType = (level) => ({ 0: 'info', 1: '', 2: 'warning', 3: 'danger' }[level] || 'info');

        // 获取经销商状态颜色
        const getDealerStatusType = (status) => ({ pending: 'warning', approved: 'success', rejected: 'danger' }[status] || 'info');

        // 获取经销商状态文本
        const getDealerStatusText = (status) => ({ pending: '待审核', approved: '已通过', rejected: '已拒绝' }[status] || status);

        // 加载类目列表
        const loadCategories = async () => {
            const res = await request('/admin/api/categories');
            if (res && res.code === 0) {
                categories.value = res.data.list || res.data || [];
            }
        };

        // 显示类目对话框
        const showCategoryDialog = (category = null) => {
            if (category) {
                Object.assign(categoryForm, category);
            } else {
                Object.assign(categoryForm, { id: null, name: '', parent_id: null, icon_url: '', sort: 0, status: 1 });
            }
            categoryDialogVisible.value = true;
        };

        // 保存类目
        const saveCategory = async () => {
            const url = categoryForm.id ? `/admin/api/categories/${categoryForm.id}` : '/admin/api/categories';
            const method = categoryForm.id ? 'PUT' : 'POST';
            const res = await request(url, { method, body: JSON.stringify(categoryForm) });
            if (res && res.code === 0) {
                categoryDialogVisible.value = false;
                loadCategories();
                ElementPlus.ElMessage.success('保存成功');
            } else {
                ElementPlus.ElMessage.error(res?.message || '保存失败');
            }
        };

        // 删除类目
        const deleteCategory = async (category) => {
            try {
                await ElementPlus.ElMessageBox.confirm('确定删除该类目？', '删除确认');
                const res = await request(`/admin/api/categories/${category.id}`, { method: 'DELETE' });
                if (res && res.code === 0) {
                    loadCategories();
                    ElementPlus.ElMessage.success('删除成功');
                }
            } catch (e) { }
        };

        // 加载素材列表
        const loadMaterials = async (page = 1) => {
            loading.value = true;
            pagination.page = page;
            let url = `/admin/api/materials?page=${page}&limit=${pagination.limit}`;
            if (materialTypeFilter.value) url += `&type=${materialTypeFilter.value}`;
            const res = await request(url);
            loading.value = false;
            if (res && res.code === 0) {
                materials.value = res.data.list || res.data || [];
                pagination.total = res.data.pagination?.total || 0;
            }
        };

        // 显示素材对话框
        const showMaterialDialog = (material = null) => {
            if (material) {
                Object.assign(materialForm, material);
            } else {
                Object.assign(materialForm, { id: null, title: '', type: 'image', url: '', content: '' });
            }
            materialDialogVisible.value = true;
        };

        // 保存素材
        const saveMaterial = async () => {
            const url = materialForm.id ? `/admin/api/materials/${materialForm.id}` : '/admin/api/materials';
            const method = materialForm.id ? 'PUT' : 'POST';
            const res = await request(url, { method, body: JSON.stringify(materialForm) });
            if (res && res.code === 0) {
                materialDialogVisible.value = false;
                loadMaterials(pagination.page);
                ElementPlus.ElMessage.success('保存成功');
            } else {
                ElementPlus.ElMessage.error(res?.message || '保存失败');
            }
        };

        // 删除素材
        const deleteMaterial = async (material) => {
            try {
                await ElementPlus.ElMessageBox.confirm('确定删除该素材？', '删除确认');
                const res = await request(`/admin/api/materials/${material.id}`, { method: 'DELETE' });
                if (res && res.code === 0) {
                    loadMaterials(pagination.page);
                    ElementPlus.ElMessage.success('删除成功');
                }
            } catch (e) { }
        };

        const showProductDialog = (product = null) => {
            if (product) {
                Object.assign(productForm, product);
            } else {
                Object.assign(productForm, { id: null, name: '', retail_price: 0, member_price: 0, stock: 0, description: '' });
            }
            productDialogVisible.value = true;
        };

        // 保存商品
        const saveProduct = async () => {
            const url = productForm.id ? `/admin/api/products/${productForm.id}` : '/admin/api/products';
            const method = productForm.id ? 'PUT' : 'POST';
            const res = await request(url, { method, body: JSON.stringify(productForm) });
            if (res && res.code === 0) {
                productDialogVisible.value = false;
                loadProducts();
                ElementPlus.ElMessage.success('保存成功');
            } else {
                ElementPlus.ElMessage.error(res?.message || '保存失败');
            }
        };

        // 切换商品状态
        const toggleProductStatus = async (product) => {
            const newStatus = product.status === 1 ? 0 : 1;
            const res = await request(`/admin/api/products/${product.id}/status`, {
                method: 'PUT',
                body: JSON.stringify({ status: newStatus })
            });
            if (res && res.code === 0) {
                loadProducts(pagination.page);
                ElementPlus.ElMessage.success('操作成功');
            }
        };

        // 轮播图对话框
        const showBannerDialog = (banner = null) => {
            if (banner) {
                Object.assign(bannerForm, banner);
            } else {
                Object.assign(bannerForm, { id: null, title: '', image_url: '', link_url: '', sort: 0 });
            }
            bannerDialogVisible.value = true;
        };

        // 保存轮播图
        const saveBanner = async () => {
            const url = bannerForm.id ? `/admin/api/banners/${bannerForm.id}` : '/admin/api/banners';
            const method = bannerForm.id ? 'PUT' : 'POST';
            const res = await request(url, { method, body: JSON.stringify(bannerForm) });
            if (res && res.code === 0) {
                bannerDialogVisible.value = false;
                loadBanners();
                ElementPlus.ElMessage.success('保存成功');
            }
        };

        // 删除轮播图
        const deleteBanner = async (banner) => {
            await ElementPlus.ElMessageBox.confirm('确定删除该轮播图?', '提示', { type: 'warning' });
            const res = await request(`/admin/api/banners/${banner.id}`, { method: 'DELETE' });
            if (res && res.code === 0) {
                loadBanners();
                ElementPlus.ElMessage.success('删除成功');
            }
        };

        // 发货对话框
        const shipOrder = (order) => {
            shipForm.orderId = order.id;
            shipForm.express_company = '';
            shipForm.express_no = '';
            shipDialogVisible.value = true;
        };

        // 确认发货
        const confirmShip = async () => {
            const res = await request(`/admin/api/orders/${shipForm.orderId}/ship`, {
                method: 'PUT',
                body: JSON.stringify({ express_company: shipForm.express_company, express_no: shipForm.express_no })
            });
            if (res && res.code === 0) {
                shipDialogVisible.value = false;
                loadOrders(pagination.page);
                ElementPlus.ElMessage.success('发货成功');
            }
        };

        // 提现操作
        const approveWithdrawal = async (item) => {
            const res = await request(`/admin/api/withdrawals/${item.id}/approve`, { method: 'PUT' });
            if (res && res.code === 0) { loadWithdrawals(pagination.page); ElementPlus.ElMessage.success('已通过'); }
        };
        const rejectWithdrawal = async (item) => {
            const { value } = await ElementPlus.ElMessageBox.prompt('请输入拒绝原因', '拒绝提现');
            const res = await request(`/admin/api/withdrawals/${item.id}/reject`, { method: 'PUT', body: JSON.stringify({ reason: value }) });
            if (res && res.code === 0) { loadWithdrawals(pagination.page); ElementPlus.ElMessage.success('已拒绝'); }
        };
        const completeWithdrawal = async (item) => {
            const res = await request(`/admin/api/withdrawals/${item.id}/complete`, { method: 'PUT' });
            if (res && res.code === 0) { loadWithdrawals(pagination.page); ElementPlus.ElMessage.success('已完成打款'); }
        };

        // 售后操作
        const approveRefund = async (item) => {
            const res = await request(`/admin/api/refunds/${item.id}/approve`, { method: 'PUT' });
            if (res && res.code === 0) { loadRefunds(pagination.page); ElementPlus.ElMessage.success('已同意'); }
        };
        const rejectRefund = async (item) => {
            const { value } = await ElementPlus.ElMessageBox.prompt('请输入拒绝原因', '拒绝售后');
            const res = await request(`/admin/api/refunds/${item.id}/reject`, { method: 'PUT', body: JSON.stringify({ reason: value }) });
            if (res && res.code === 0) { loadRefunds(pagination.page); ElementPlus.ElMessage.success('已拒绝'); }
        };

        // 辅助函数
        const getOrderStatusType = (status) => ({ pending: 'warning', paid: 'primary', shipped: 'info', completed: 'success', cancelled: 'danger' }[status] || 'info');
        const getOrderStatusText = (status) => ({ pending: '待付款', paid: '待发货', shipped: '已发货', completed: '已完成', cancelled: '已取消' }[status] || status);
        const getRoleText = (level) => ['游客', '会员', '团长', '合伙人'][level] || '未知';
        const getWithdrawStatusType = (status) => ({ pending: 'warning', approved: 'primary', completed: 'success', rejected: 'danger' }[status] || 'info');
        const getRefundStatusType = (status) => ({ pending: 'warning', approved: 'primary', completed: 'success', rejected: 'danger' }[status] || 'info');

        const showOrderDetail = (order) => { ElementPlus.ElMessage.info(`订单详情: ${order.order_no}`); };
        const showUserDetail = (user) => { ElementPlus.ElMessage.info(`用户详情: ${user.nickname}`); };

        // 初始化
        onMounted(() => {
            const token = localStorage.getItem('admin_token');
            if (token) {
                request('/admin/api/profile').then(res => {
                    if (res && res.code === 0) {
                        adminInfo.value = res.data;
                        isLoggedIn.value = true;
                        loadDashboard();
                    }
                });
            }
        });

        return {
            isLoggedIn, adminInfo, currentPage, loading, loginLoading,
            loginForm, stats, products, orders, users, banners, withdrawals, refunds, pagination,
            distributors, dealers, distributorFilter, dealerFilter,
            categories, categoryFilter, productTab, contentTab,
            materials, materialTypeFilter, materialDialogVisible, materialForm,
            productDialogVisible, bannerDialogVisible, shipDialogVisible, categoryDialogVisible,
            productForm, bannerForm, shipForm, categoryForm,
            handleLogin, handleLogout, handleMenuSelect,
            loadProducts, loadOrders, loadUsers, loadBanners, loadWithdrawals, loadRefunds,
            loadDistributors, loadDealers, loadCategories, loadMaterials,
            showProductDialog, saveProduct, toggleProductStatus,
            showBannerDialog, saveBanner, deleteBanner,
            showCategoryDialog, saveCategory, deleteCategory,
            showMaterialDialog, saveMaterial, deleteMaterial,
            shipOrder, confirmShip,
            approveWithdrawal, rejectWithdrawal, completeWithdrawal,
            approveRefund, rejectRefund,
            showDistributorDetail, changeUserRole, showDealerDetail, approveDealer, rejectDealer,
            getOrderStatusType, getOrderStatusText, getRoleText, getWithdrawStatusType, getRefundStatusType,
            getRoleLevelType, getDealerStatusType, getDealerStatusText,
            showOrderDetail, showUserDetail
        };
    }
});

// 注册 Element Plus
app.use(ElementPlus);

// 注册图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component);
}

// 挂载
app.mount('#app');
