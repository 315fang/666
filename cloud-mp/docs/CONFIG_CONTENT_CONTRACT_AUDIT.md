# Config Content Contract Audit

生成时间：2026-04-18T06:27:35.328Z
结果：PASS

| 模块 | 检查项 | 结果 | 说明 |
| --- | --- | --- | --- |
| config | mini program config logistics options | PASS | normalizeMiniProgramConfig => ["顺丰速运","申通快递"] |
| config | popup ad canonical field | PASS | normalizePopupAdConfig => "cloud://img" |
| config | home content brand zone defaults | PASS | flattenHomeConfigs => {"enabled":false,"title":"品牌专区","welcomeTitle":"Welcome","cards":0,"certifications":0} |
| config | home content brand zone legacy compatibility | PASS | flattenHomeConfigs => {"enabled":true,"card":{"title":"实验检测","subtitle":"过程可追溯","image":"","file_id":"cloud://brand-card","link_type":"page","link_value":"/pages/activity/activity"},"certification":{"title":"企业认证","subtitle":"","image":"","file_id":""}} |
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
