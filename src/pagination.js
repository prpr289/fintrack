export function getPagination({ total = 0, page = 1, pageSize = 50 } = {}) {
  const normalizedTotal = Math.max(0, Number(total) || 0)
  const normalizedPageSize = Math.max(1, Number(pageSize) || 1)
  const totalPages = Math.ceil(normalizedTotal / normalizedPageSize)
  const safePage = totalPages > 0
    ? Math.min(Math.max(1, Number(page) || 1), totalPages)
    : 1
  const offset = (safePage - 1) * normalizedPageSize

  return {
    total: normalizedTotal,
    page: safePage,
    pageSize: normalizedPageSize,
    totalPages,
    offset,
    startRow: normalizedTotal > 0 ? offset + 1 : 0,
    endRow: normalizedTotal > 0 ? Math.min(offset + normalizedPageSize, normalizedTotal) : 0,
    hasPrevious: safePage > 1,
    hasNext: safePage < totalPages,
  }
}

export function getPageItems({ page = 1, totalPages = 0 } = {}) {
  const normalizedTotalPages = Math.max(0, Number(totalPages) || 0)
  if (normalizedTotalPages <= 7) {
    return Array.from({ length: normalizedTotalPages }, (_, index) => index + 1)
  }

  const safePage = Math.min(Math.max(1, Number(page) || 1), normalizedTotalPages)
  if (safePage <= 3) return [1, 2, 3, 'end-ellipsis', normalizedTotalPages]
  if (safePage >= normalizedTotalPages - 2) {
    return [1, 'start-ellipsis', normalizedTotalPages - 2, normalizedTotalPages - 1, normalizedTotalPages]
  }
  return [1, 'start-ellipsis', safePage - 1, safePage, safePage + 1, 'end-ellipsis', normalizedTotalPages]
}

export async function collectPaginatedItems(fetchPage, { pageSize = 1000 } = {}) {
  const normalizedPageSize = Math.max(1, Number(pageSize) || 1)
  const items = []
  let total
  let offset = 0

  do {
    const data = await fetchPage({ limit: normalizedPageSize, offset })
    const batch = Array.isArray(data?.items) ? data.items : []
    total = Math.max(0, Number(data?.total) || 0)
    items.push(...batch)
    offset += batch.length
    if (batch.length === 0) break
  } while (offset < total)

  return { items, total }
}
