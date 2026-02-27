import request from '@/utils/request'

export function getDbTables() {
    return request({
        url: '/db-indexes/tables',
        method: 'get'
    })
}

export function getDbTableColumns(table) {
    return request({
        url: `/db-indexes/${encodeURIComponent(table)}/columns`,
        method: 'get'
    })
}

export function getDbTableIndexes(table) {
    return request({
        url: `/db-indexes/${encodeURIComponent(table)}`,
        method: 'get'
    })
}

export function createDbIndex(payload) {
    return request({
        url: '/db-indexes',
        method: 'post',
        data: payload
    })
}

export function dropDbIndex(table, indexName) {
    return request({
        url: `/db-indexes/${encodeURIComponent(table)}/${encodeURIComponent(indexName)}`,
        method: 'delete'
    })
}
