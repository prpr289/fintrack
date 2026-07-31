// Run: node src/fmt.test.mjs   (fails loudly if the UTC date bug regresses)
// Bug fixed 2026-07-17: "เดือนนี้" showed 30/6 because toISOString() is UTC.
import assert from 'node:assert'
import { ymd, sqlTime } from './fmt.js'

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

// --- sqlTime(): D1 timestamps are UTC without a marker ---
// 18:30 UTC on 31 Jul is already 01:30 on 1 Aug in Thailand — the DAY must not be wrong.
assert.strictEqual(sqlTime('2026-07-31 18:30:00').toISOString(), '2026-07-31T18:30:00.000Z')
assert.strictEqual(sqlTime('2026-07-28 06:01:32').toISOString(), '2026-07-28T06:01:32.000Z')
assert.strictEqual(sqlTime('2026-07-28T06:01:32Z').toISOString(), '2026-07-28T06:01:32.000Z')  // ISO ก็รับ
assert.strictEqual(sqlTime(null), null)
assert.strictEqual(sqlTime('ไม่ใช่เวลา'), null)

console.log('fmt.test.mjs OK — ymd() is local-timezone safe, sqlTime() pins D1 timestamps to UTC')
