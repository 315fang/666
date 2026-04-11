import request from '@/utils/request'
import { normalizeListResult } from '@/api/normalize'

export const getFeaturedBoard = () =>
  request({ url: '/boards', method: 'get', params: { board_key: 'home.featuredProducts' } }).then(normalizeListResult)

export const getBoardProducts = (boardId) =>
  request({ url: `/boards/${boardId}/products`, method: 'get' }).then(normalizeListResult)

export const addBoardProducts = (boardId, productIds) =>
  request({ url: `/boards/${boardId}/products`, method: 'post', data: { product_ids: productIds } })

export const updateBoardProduct = (boardId, relationId, data) =>
  request({ url: `/boards/${boardId}/products/${relationId}`, method: 'put', data })

export const deleteBoardProduct = (boardId, relationId) =>
  request({ url: `/boards/${boardId}/products/${relationId}`, method: 'delete' })

export const sortBoardProducts = (boardId, orders) =>
  request({ url: `/boards/${boardId}/products/sort`, method: 'post', data: { orders } })
