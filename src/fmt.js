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

// D1/SQLite CURRENT_TIMESTAMP comes back as "2026-07-31 06:01:32" — UTC, but with no
// marker, so `new Date(s)` reads it as LOCAL and shows it 7 hours early in Thailand
// (a late-evening row lands on the wrong DAY). Pin it to UTC before formatting.
export function sqlTime(s) {
  if (!s) return null
  const d = new Date(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? s.replace(' ', 'T') + 'Z' : s)
  return isNaN(d) ? null : d
}
