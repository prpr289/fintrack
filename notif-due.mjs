// Pure date helpers for recurring-expense notifications.
// Shared by worker.js (wrangler bundles the relative import) and notif-due.test.mjs.
// ponytail: dependency-free so the money/date logic has one runnable check.

// Add n days to a 'YYYY-MM-DD' string, returning 'YYYY-MM-DD' (UTC-based, matching the worker's `today`).
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Soonest due date to alert on for a manual (auto_create=0) recurring template:
//   next_due_date set -> use verbatim (any frequency)
//   else monthly      -> this month's due_day, clamped to the month length
//   else              -> null (weekly/daily/yearly store only a day-of-month; not enough to infer a date)
// calcNextDueDate() in worker.js is NOT reusable here: it returns the period strictly AFTER
// fromDate, which would skip the current period.
export function effectiveDue(rec, today) {
  if (rec.next_due_date) return rec.next_due_date
  if (rec.frequency === 'monthly') {
    const [y, m] = today.split('-').map(Number)
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const day = Math.min(rec.due_day || 1, daysInMonth)
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  return null
}
