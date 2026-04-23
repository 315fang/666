const registry = require('./miniProgramTargetsData')

const TAB_PAGES = Array.isArray(registry.tabPages) ? registry.tabPages.slice() : []
const PAGE_WHITELIST_PREFIXES = Array.isArray(registry.pageWhitelistPrefixes)
    ? registry.pageWhitelistPrefixes.slice()
    : []
const MINI_PROGRAM_TARGETS = Array.isArray(registry.targets) ? registry.targets.slice() : []

function stripQuery(path) {
    return String(path || '').trim().split('?')[0] || ''
}

function normalizeTargetLinkValue(linkType, linkValue) {
    const type = String(linkType || 'none').trim()
    const value = String(linkValue || '').trim()
    if (type === 'flash_sale') {
        return value === '__flash_sale__' ? '' : value
    }
    return value
}

function isValidPagePath(path) {
    const safePath = stripQuery(path)
    if (!safePath || !safePath.startsWith('/pages/')) return false
    return PAGE_WHITELIST_PREFIXES.some((prefix) => safePath.startsWith(prefix))
}

function matchesTarget(target, linkType, linkValue) {
    if (!target || target.link_type !== String(linkType || 'none').trim()) return false
    return normalizeTargetLinkValue(target.link_type, target.link_value) === normalizeTargetLinkValue(linkType, linkValue)
}

function findTargetByLink(linkType, linkValue) {
    return MINI_PROGRAM_TARGETS.find((target) => matchesTarget(target, linkType, linkValue)) || null
}

module.exports = {
    MINI_PROGRAM_TARGETS,
    TAB_PAGES,
    PAGE_WHITELIST_PREFIXES,
    stripQuery,
    isValidPagePath,
    normalizeTargetLinkValue,
    findTargetByLink
}
