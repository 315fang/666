# CloudBase Import Package

这个目录存放可导入 CloudBase 控制台的 JSONL 数据包。

生成顺序：

```powershell
node .\scripts\normalize-cloudbase-data.js
node .\scripts\build-cloudbase-import-jsonl.js
```

生成后每个集合会对应一个 `*.jsonl` 文件。

建议导入顺序：

1. `users`
2. `categories`
3. `products`
4. `skus`
5. `banners`
6. `materials`
7. `material_groups`
8. `orders`
9. `refunds`
10. `reviews`
11. `commissions`
12. `withdrawals`
13. `admins`
14. `admin_roles`

注意：

- 当前导入包仍属于迁移期数据包
- 管理员密码字段仅用于后台兼容，不建议直接作为正式 CloudBase Auth 方案
- 图片字段目前仍有旧 URL，后续还需要切到 `file_id`
