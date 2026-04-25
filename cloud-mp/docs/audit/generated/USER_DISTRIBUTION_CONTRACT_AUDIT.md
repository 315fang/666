# User Distribution Contract Audit

生成时间：2026-04-25T02:43:56.955Z
结果：PASS

| 模块 | 检查项 | 结果 | 说明 |
| --- | --- | --- | --- |
| user | commission balance canonical | PASS | resolveCommissionBalance({"commission_balance":18.6,"balance":99}) => 18.6 |
| user | goods fund balance canonical | PASS | resolveGoodsFundBalance({"goods_fund_balance":0,"agent_wallet_balance":56.2,"wallet_balance":11}) => 56.2 |
| user | role level canonical | PASS | resolveRoleLevel({"role_level":4,"distributor_level":2}) => 4 |
| login | commission balance canonical | PASS | resolveCommissionBalance({"commission_balance":18.6,"balance":99}) => 18.6 |
| login | goods fund balance canonical | PASS | resolveGoodsFundBalance({"goods_fund_balance":0,"agent_wallet_balance":56.2,"wallet_balance":11}) => 56.2 |
| login | role level canonical | PASS | resolveRoleLevel({"role_level":4,"distributor_level":2}) => 4 |
| distribution | commission balance canonical | PASS | resolveCommissionBalance({"commission_balance":18.6,"balance":99}) => 18.6 |
| distribution | goods fund balance canonical | PASS | resolveGoodsFundBalance({"goods_fund_balance":0,"agent_wallet_balance":56.2,"wallet_balance":11}) => 56.2 |
| distribution | role level canonical | PASS | resolveRoleLevel({"role_level":4,"distributor_level":2}) => 4 |
| admin-api | commission balance canonical | PASS | resolveCommissionBalance({"commission_balance":18.6,"balance":99}) => 18.6 |
| admin-api | goods fund balance canonical | PASS | resolveGoodsFundBalance({"goods_fund_balance":0,"agent_wallet_balance":56.2,"wallet_balance":11}) => 56.2 |
| admin-api | role level canonical | PASS | resolveRoleLevel({"role_level":4,"distributor_level":2}) => 4 |
| source | cloudfunctions/login/index.js contains buildCanonicalUser | PASS | cloudfunctions/login/index.js |
| source | cloudfunctions/login/index.js contains user-contract | PASS | cloudfunctions/login/index.js |
| source | cloudfunctions/user/user-profile.js contains buildCanonicalUser | PASS | cloudfunctions/user/user-profile.js |
| source | cloudfunctions/user/user-profile.js contains user-contract | PASS | cloudfunctions/user/user-profile.js |
| source | cloudfunctions/distribution/distribution-query.js contains buildCanonicalUser | PASS | cloudfunctions/distribution/distribution-query.js |
| source | cloudfunctions/distribution/distribution-query.js contains goods_fund_balance | PASS | cloudfunctions/distribution/distribution-query.js |
| source | cloudfunctions/distribution/distribution-query.js contains commission_balance | PASS | cloudfunctions/distribution/distribution-query.js |
| source | cloudfunctions/distribution/index.js contains normalizeTeamMember | PASS | cloudfunctions/distribution/index.js |
| source | cloudfunctions/distribution/index.js contains goods_fund_balance | PASS | cloudfunctions/distribution/index.js |
| source | cloudfunctions/distribution/index.js contains role_name | PASS | cloudfunctions/distribution/index.js |
| source | cloudfunctions/admin-api/src/app.js contains buildCanonicalUser | PASS | cloudfunctions/admin-api/src/app.js |
| source | cloudfunctions/admin-api/src/app.js contains goods_fund_balance | PASS | cloudfunctions/admin-api/src/app.js |
| source | cloudfunctions/admin-api/src/app.js contains status_text | PASS | cloudfunctions/admin-api/src/app.js |
