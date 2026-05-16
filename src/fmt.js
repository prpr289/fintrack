export function thb(n) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 2 }).format(n ?? 0)
}

export function date(s) {
  if (!s) return '-'
  return new Date(s).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}
