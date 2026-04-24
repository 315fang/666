# Config Content Contract Audit

生成时间：2026-04-24T06:27:06.658Z
结果：PASS

| 模块 | 检查项 | 结果 | 说明 |
| --- | --- | --- | --- |
| config | mini program config logistics options | PASS | normalizeMiniProgramConfig => ["顺丰速运","申通快递"] |
| config | popup ad canonical field | PASS | normalizePopupAdConfig => "cloud://img" |
| config | home content brand zone defaults | PASS | flattenHomeConfigs => {"enabled":false,"title":"品牌专区","welcomeTitle":"Welcome","cards":0,"certifications":0} |
| config | home content brand zone legacy compatibility | PASS | flattenHomeConfigs => {"enabled":true,"card":{"title":"最新活动","subtitle":"过程可追溯","image":"cloud://brand-card","file_id":"cloud://brand-card","slot_index":0,"category_key":"latest_activity","link_type":"page","link_value":"/pages/index/brand-news-list?category_key=latest_activity"},"certification":{"title":"企业认证","subtitle":"","image":"","file_id":""}} |
| admin-api | home section canonical field | PASS | normalizeHomeSectionRecord => "home.hero" |
| source | cloudfunctions/config/index.js contains normalizeMiniProgramConfig | PASS | cloudfunctions/config/index.js |
| source | cloudfunctions/config/index.js contains normalizeHomeContentPayload | PASS | cloudfunctions/config/index.js |
| source | cloudfunctions/config/index.js contains normalizeSplashConfig | PASS | cloudfunctions/config/index.js |
| source | cloudfunctions/admin-api/src/app.js contains configContract.normalizeMiniProgramConfig | PASS | cloudfunctions/admin-api/src/app.js |
| source | cloudfunctions/admin-api/src/app.js contains configContract.normalizePopupAdConfig | PASS | cloudfunctions/admin-api/src/app.js |
| source | cloudfunctions/admin-api/src/app.js contains patchCollectionRow('content_boards' | PASS | cloudfunctions/admin-api/src/app.js |
| source | cloudfunctions/config/config-contract.js contains brand_zone_enabled | PASS | cloudfunctions/config/config-contract.js |
| source | cloudfunctions/config/config-contract.js contains brand_zone_cover_file_id | PASS | cloudfunctions/config/config-contract.js |
| source | cloudfunctions/config/config-contract.js contains flattenHomeConfigs | PASS | cloudfunctions/config/config-contract.js |
