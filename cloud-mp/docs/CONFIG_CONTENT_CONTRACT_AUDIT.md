# Config Content Contract Audit

生成时间：2026-04-14T02:20:40.167Z
结果：PASS

| 模块 | 检查项 | 结果 | 说明 |
| --- | --- | --- | --- |
| config | mini program config logistics options | PASS | normalizeMiniProgramConfig => ["顺丰速运","申通快递"] |
| config | popup ad canonical field | PASS | normalizePopupAdConfig => "cloud://img" |
| admin-api | mini program config logistics options | PASS | normalizeMiniProgramConfig => ["顺丰速运","申通快递"] |
| admin-api | popup ad canonical field | PASS | normalizePopupAdConfig => "cloud://img" |
| admin-api | home section canonical field | PASS | normalizeHomeSectionRecord => "home.hero" |
| source | cloudfunctions/config/index.js contains normalizeMiniProgramConfig | PASS | cloudfunctions/config/index.js |
| source | cloudfunctions/config/index.js contains normalizeHomeContentPayload | PASS | cloudfunctions/config/index.js |
| source | cloudfunctions/config/index.js contains normalizeSplashConfig | PASS | cloudfunctions/config/index.js |
| source | cloudfunctions/admin-api/src/app.js contains configContract.normalizeMiniProgramConfig | PASS | cloudfunctions/admin-api/src/app.js |
| source | cloudfunctions/admin-api/src/app.js contains configContract.normalizePopupAdConfig | PASS | cloudfunctions/admin-api/src/app.js |
| source | cloudfunctions/admin-api/src/app.js contains patchCollectionRow('content_boards' | PASS | cloudfunctions/admin-api/src/app.js |
