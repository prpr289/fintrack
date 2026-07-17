// Run: node src/fmt.test.mjs   (fails loudly if the UTC date bug regresses)
// Bug fixed 2026-07-17: "เดือนนี้" showed 30/6 because toISOString() is UTC.
import assert from 'node:assert'
import { ymd, utcDate } from './fmt.js'

// 1 Jul 2026 local midnight must format as 2026-07-01, never 2026-06-30.
const firstOfJuly = new Date(2026, 6, 1)
assert.strictEqual(ymd(firstOfJuly), '2026-07-01')

// Demonstrate the old bug still exists in toISOString (in any TZ east of UTC).
if (firstOfJuly.getTimezoneOffset() < 0) {
  assert.strictEqual(firstOfJuly.toISOString().slice(0, 10), '2026-06-30',
    'expected toISOString to shift back a day east of UTC — bug premise')
}

// Last day of month & padding.
assert.strictEqual(ymd(new Date(2026, 6, 0)), '2026-06-30')  // last of June
assert.strictEqual(ymd(new Date(2026, 0, 5)), '2026-01-05')  // zero-pad

// utcDate: D1's CURRENT_TIMESTAMP "YYYY-MM-DD HH:MM:SS" is UTC. Parse it as UTC
// (TZ-independent check), else browsers read it as local time and shift the day.
assert.strictEqual(utcDate('2026-07-16 18:00:00').toISOString(), '2026-07-16T18:00:00.000Z')
// East of UTC+6, 18:00 UTC on 16 Jul is already 17 Jul locally — the LINE-registration
// bug was raw .slice() showing 16 Jul. utcDate + ymd must render 17 Jul.
if (utcDate('2026-07-16 18:00:00').getTimezoneOffset() <= -360) {
  assert.strictEqual(ymd(utcDate('2026-07-16 18:00:00')), '2026-07-17')
}

console.log('fmt.test.mjs OK — ymd() is local-timezone safe')
