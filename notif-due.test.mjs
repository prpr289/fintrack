// Run: node notif-due.test.mjs   (self-check for the recurring-notification date logic)
import assert from 'node:assert'
import { addDays, effectiveDue } from './notif-due.mjs'

// --- addDays ---
assert.strictEqual(addDays('2026-07-19', 3), '2026-07-22')
assert.strictEqual(addDays('2026-07-30', 3), '2026-08-02')   // month rollover
assert.strictEqual(addDays('2026-12-31', 1), '2027-01-01')   // year rollover
assert.strictEqual(addDays('2026-07-19', 0), '2026-07-19')

// --- effectiveDue ---
// explicit next_due_date wins regardless of frequency
assert.strictEqual(effectiveDue({ next_due_date: '2026-08-01', frequency: 'weekly', due_day: 3 }, '2026-07-19'), '2026-08-01')
// monthly, no next_due_date -> this month's due_day (past this month => surfaces as overdue upstream)
assert.strictEqual(effectiveDue({ next_due_date: null, frequency: 'monthly', due_day: 15 }, '2026-07-19'), '2026-07-15')
// monthly, upcoming this month
assert.strictEqual(effectiveDue({ next_due_date: null, frequency: 'monthly', due_day: 25 }, '2026-07-19'), '2026-07-25')
// clamp due_day 31 in February
assert.strictEqual(effectiveDue({ next_due_date: null, frequency: 'monthly', due_day: 31 }, '2026-02-10'), '2026-02-28')
// clamp due_day 31 in a 30-day month
assert.strictEqual(effectiveDue({ next_due_date: null, frequency: 'monthly', due_day: 31 }, '2026-06-10'), '2026-06-30')
// non-monthly without next_due_date -> null (can't infer)
assert.strictEqual(effectiveDue({ next_due_date: null, frequency: 'weekly', due_day: 3 }, '2026-07-19'), null)
assert.strictEqual(effectiveDue({ next_due_date: null, frequency: 'daily', due_day: 1 }, '2026-07-19'), null)
assert.strictEqual(effectiveDue({ next_due_date: null, frequency: 'yearly', due_day: 1 }, '2026-07-19'), null)

console.log('notif-due.test.mjs OK')
