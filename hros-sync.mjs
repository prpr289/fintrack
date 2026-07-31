// Kill-switch state for the HR OS -> Fintrack expense sync.
// Stored as one key inside users.settings (JSON) of HROS_SERVICE_USER_ID — no new
// table, and read ONLY by the HROS branch of requireAuth, so the LINE bot path is
// unaffected even if both systems share a service user.
// ponytail: flag lives here so it has one runnable check.

// Absent/unparsable settings = ON (fail open): the switch is a convenience, the
// token is the actual security boundary. A corrupt JSON blob must not silently
// stop payroll from syncing.
export function hrosSyncEnabled(settingsJson) {
  try {
    return JSON.parse(settingsJson || '{}')?.hrosSyncEnabled !== false
  } catch {
    return true
  }
}

// Read-modify-write so other keys in users.settings survive the toggle.
export function withHrosSync(settingsJson, enabled) {
  let s = {}
  try { s = JSON.parse(settingsJson || '{}') || {} } catch { s = {} }
  if (typeof s !== 'object' || Array.isArray(s)) s = {}
  return JSON.stringify({ ...s, hrosSyncEnabled: !!enabled })
}
