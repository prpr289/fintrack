export function thb(n) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', minimumFractionDigits: 2 }).format(n ?? 0)
}

export function date(s) {
  if (!s) return '-'
  return new Date(s).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

// Local-timezone YYYY-MM-DD. Never use toISOString() for calendar dates:
// it converts to UTC, which shifts Thai (UTC+7) midnights back one day.
export function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function today() {
  return ymd(new Date())
}

// D1/SQLite CURRENT_TIMESTAMP is UTC "YYYY-MM-DD HH:MM:SS" with no zone marker,
// which browsers parse as LOCAL time — shifting the day. Force UTC before formatting.
export function utcDate(s) {
  return new Date(s.replace(' ', 'T') + 'Z')
}
