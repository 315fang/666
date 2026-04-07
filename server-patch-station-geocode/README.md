# 后端补丁：站点地址腾讯地理编码（2025）

## 目录说明

将本目录下 **`backend/`** 内文件 **覆盖到服务器项目对应路径**（与仓库 `backend/` 结构一致）。

```
server-patch-station-geocode/backend/
├── utils/
│   ├── tencentGeocoder.js      ← 新增
│   └── stationGeocode.js       ← 新增
└── routes/admin/controllers/
    ├── adminPickupStationController.js   ← 替换
    └── adminBranchAgentController.js     ← 替换
```

## 服务器环境变量

在 **`backend/.env`**（不要用 `.env.example` 当运行配置）中增加一行：

```env
TENCENT_MAP_KEY=你的腾讯位置服务_WebService_Key
```

详见同目录 **`backend-env-snippet.txt`**。

## 部署后

重启 Node 进程。无需执行数据库迁移。
