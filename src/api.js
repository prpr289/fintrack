const BASE = 'https://fintrack-api.iamcreatle.workers.dev'

function token() {
  return localStorage.getItem('ft_token')
}

async function req(method, path, body) {
  const headers = { 'Content-Type': 'application/json' }
  const t = token()
  if (t) headers['Authorization'] = `Bearer ${t}`
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด')
  return data
}

export const api = {
  login: (email, password) => req('POST', '/auth/login', { email, password }),
  register: (body) => req('POST', '/auth/register', body),
  me: () => req('GET', '/me'),
  updateMe: (body) => req('PATCH', '/me', body),
  changePassword: (currentPassword, newPassword) =>
    req('POST', '/me/password', { currentPassword, newPassword }),

  wallets: () => req('GET', '/wallets'),
  createWallet: (body) => req('POST', '/wallets', body),
  updateWallet: (id, body) => req('PATCH', `/wallets/${id}`, body),
  deleteWallet: (id) => req('DELETE', `/wallets/${id}`),

  transactions: (params) => req('GET', '/transactions?' + new URLSearchParams(params || {})),
  createTransaction: (body) => req('POST', '/transactions', body),
  updateTransaction: (id, body) => req('PATCH', `/transactions/${id}`, body),
  deleteTransaction: (id) => req('DELETE', `/transactions/${id}`),
  reconcileTransaction: (id) => req('PATCH', `/transactions/${id}/reconcile`),
  confirmTransaction: (id, body) => req('POST', `/transactions/${id}/confirm`, body),
  confirmEdit: (id) => req('POST', `/transactions/${id}/confirm-edit`),
  cancelEdit: (id) => req('POST', `/transactions/${id}/cancel-edit`),
  printTransaction: (id) => req('POST', `/transactions/${id}/print`),

  createTransfer: (body) => req('POST', '/transfers', body),

  categories: () => req('GET', '/categories'),
  createCategory: (body) => req('POST', '/categories', body),
  updateCategory: (id, body) => req('PATCH', `/categories/${id}`, body),
  deleteCategory: (id) => req('DELETE', `/categories/${id}`),

  users: () => req('GET', '/users'),
  createUser: (body) => req('POST', '/users', body),
  updateUser: (id, body) => req('PATCH', `/users/${id}`, body),
  deleteUser: (id) => req('DELETE', `/users/${id}`),

  recurring: () => req('GET', '/recurring'),
  createRecurring: (body) => req('POST', '/recurring', body),
  updateRecurring: (id, body) => req('PATCH', `/recurring/${id}`, body),
  deleteRecurring: (id) => req('DELETE', `/recurring/${id}`),
  triggerRecurring: (id) => req('POST', `/recurring/${id}/trigger`),
  notifications: (days) => req('GET', '/notifications' + (days ? `?days=${days}` : '')),

  auditLog: (params) => req('GET', '/audit-log?' + new URLSearchParams(params || {})),

  reportWallets: (params) => req('GET', '/reports/wallets?' + new URLSearchParams(params || {})),

  vendorProfiles: (name) => req('GET', '/vendor-profiles' + (name ? `?name=${encodeURIComponent(name)}` : '')),
  learnVendor: (body) => req('POST', '/vendor-profiles', body),

  categoryRules: () => req('GET', '/category-rules'),
  createCategoryRule: (body) => req('POST', '/category-rules', body),
  updateCategoryRule: (id, body) => req('PATCH', `/category-rules/${id}`, body),
  deleteCategoryRule: (id) => req('DELETE', `/category-rules/${id}`),
  updateVendor: (id, body) => req('PATCH', `/vendor-profiles/${id}`, body),
  deleteVendor: (id) => req('DELETE', `/vendor-profiles/${id}`),

  budgets: () => req('GET', '/budgets'),
  createBudget: (body) => req('POST', '/budgets', body),
  updateBudget: (id, body) => req('PATCH', `/budgets/${id}`, body),
  deleteBudget: (id) => req('DELETE', `/budgets/${id}`),

  allSlips: (params) => req('GET', '/slips?' + new URLSearchParams(params || {})),
  // Bulk upload: analyze one slip (OCR + vendor suggestion), no DB write.
  ocrSlip: (file) => {
    const t = token()
    const headers = { 'Content-Type': file.type }
    if (t) headers['Authorization'] = `Bearer ${t}`
    return fetch(`${BASE}/slips/ocr`, { method: 'POST', headers, body: file })
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'อ่านสลิปไม่สำเร็จ')
        return d
      })
  },
  listSlips: (transactionId) => req('GET', `/transactions/${transactionId}/slips`),
  uploadSlip: (transactionId, file, slipType = 'receipt') => {
    const t = token()
    const headers = {}
    if (t) headers['Authorization'] = `Bearer ${t}`
    headers['Content-Type'] = file.type
    const params = new URLSearchParams({ type: slipType, name: file.name })
    return fetch(`${BASE}/transactions/${transactionId}/slips?${params}`, {
      method: 'POST', headers, body: file,
    }).then(async r => {
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'อัพโหลดไม่สำเร็จ')
      return d
    })
  },
  downloadSlipBlob: async (slipId) => {
    const t = token()
    const res = await fetch(`${BASE}/slips/${slipId}`, {
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    })
    if (!res.ok) throw new Error('โหลดไฟล์ไม่สำเร็จ')
    return res.blob()
  },
  fetchSlipBlob: async (slipId) => {
    const t = token()
    const res = await fetch(`${BASE}/slips/${slipId}`, {
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    })
    if (!res.ok) throw new Error('โหลดไฟล์ไม่สำเร็จ')
    return URL.createObjectURL(await res.blob())
  },
  deleteSlip: (slipId) => req('DELETE', `/slips/${slipId}`),
  lineUsers: () => req('GET', '/line-users'),
  deleteLineUser: (id) => req('DELETE', `/line-users/${id}`),
}
