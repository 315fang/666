/**
 * 管理端 API：按业务域拆分为 modules/*，此处统一再导出，调用方仍使用 `@/api` 或 `@/api/index`。
 */
export * from './modules/auth'
export * from './modules/statistics'
export * from './modules/catalog'
export * from './modules/ordersFulfillment'
export * from './modules/marketing'
export * from './modules/users'
export * from './modules/finance'
export * from './modules/partners'
export * from './modules/content'
export * from './modules/mediaUpload'
export * from './modules/system'
export * from './modules/agentSystem'
export * from './modules/boards'
