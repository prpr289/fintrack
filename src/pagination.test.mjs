import assert from 'node:assert/strict'
import test from 'node:test'
import { collectPaginatedItems, getPageItems, getPagination } from './pagination.js'

test('describes the first transaction page for the selected page size', () => {
  assert.deepEqual(getPagination({ total: 788, page: 1, pageSize: 50 }), {
    total: 788,
    page: 1,
    pageSize: 50,
    totalPages: 16,
    offset: 0,
    startRow: 1,
    endRow: 50,
    hasPrevious: false,
    hasNext: true,
  })
})

test('keeps the first, nearby, and last pages visible in a long result set', () => {
  assert.deepEqual(getPageItems({ page: 1, totalPages: 16 }), [1, 2, 3, 'end-ellipsis', 16])
  assert.deepEqual(getPageItems({ page: 8, totalPages: 16 }), [1, 'start-ellipsis', 7, 8, 9, 'end-ellipsis', 16])
})

test('clamps a stale page after the rows-per-page value changes', () => {
  assert.deepEqual(getPagination({ total: 788, page: 16, pageSize: 100 }), {
    total: 788,
    page: 8,
    pageSize: 100,
    totalPages: 8,
    offset: 700,
    startRow: 701,
    endRow: 788,
    hasPrevious: true,
    hasNext: false,
  })
})

test('returns a stable empty state without phantom rows or navigation', () => {
  assert.deepEqual(getPagination({ total: 0, page: 4, pageSize: 25 }), {
    total: 0,
    page: 1,
    pageSize: 25,
    totalPages: 0,
    offset: 0,
    startRow: 0,
    endRow: 0,
    hasPrevious: false,
    hasNext: false,
  })
  assert.deepEqual(getPageItems({ page: 1, totalPages: 0 }), [])
})

test('collects every API page when a result set exceeds the per-request limit', async () => {
  const source = Array.from({ length: 1005 }, (_, index) => index + 1)
  const calls = []
  const result = await collectPaginatedItems(({ limit, offset }) => {
    calls.push({ limit, offset })
    return Promise.resolve({ items: source.slice(offset, offset + limit), total: source.length })
  }, { pageSize: 1000 })

  assert.deepEqual(calls, [
    { limit: 1000, offset: 0 },
    { limit: 1000, offset: 1000 },
  ])
  assert.deepEqual(result, { items: source, total: source.length })
})
