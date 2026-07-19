# In-app Recurring Expense Notifications — Design

Date: 2026-07-19
Branch: `claude/recurring-expense-notifications-0de811`
Status: approved design (pending spec review)

## Problem

The app already has recurring templates (`recurring_templates`) with an hourly cron
(`processRecurring`) that auto-posts transactions for `auto_create=1` items. But there is
**no in-app notification** at all. Two gaps hurt users:

1. Items with `auto_create=0` (e.g. ค่ามือถือ, ค่าเช่า — bills paid/recorded manually)
   fire silently. When they come due, nothing tells anyone; they get forgotten.
2. `draft_mode` items auto-create a **draft** transaction that needs confirmation
   (amount + slip). Nothing surfaces that a draft is waiting.

Goal: a bell icon with an unread badge and a dropdown listing what needs attention.

## Scope

**In:** two notification kinds, derived live from existing data — no new table.

| kind | source (workspace-scoped) |
|---|---|
| `due` / `overdue` | `recurring_templates`: `auto_create=0`, `is_active=1`, effective due date ≤ today+3. `overdue` if effective due < today, else `due`. (Manual items — must be recorded.) |
| `upcoming` | `recurring_templates`: `auto_create=1` AND NOT `draft_mode`, `is_active=1`, effective due date ≤ today+3. Heads-up before the cron auto-charges (e.g. "จะตัดเงินอัตโนมัติใน 2 วัน"). Clears itself once charged (cron advances `next_due_date`). |
| `draft` | `transactions`: `is_draft=1 AND recurring_id IS NOT NULL` (drafts spawned by recurring `draft_mode`; these skip `upcoming` to avoid double-alerting). |

(Update 2026-07-19: `upcoming` added after first deploy — a purely-auto setup produced no notifications otherwise, defeating the feature for common autopay bills.)

**Audience:** admin + staff only. Other roles get an empty list.

**Out (YAGNI — add later if wanted):**
- `posted` (FYI that an `auto_create=1` item was auto-charged) — cut by user, too noisy.
- A real `notifications` table / persistent history / cross-device read sync.
- Per-item dismiss, live WebSocket push, user-configurable lead-time (fixed at 3 days).

## Why derived, no migration

Both surviving kinds are functions of current state:
- `due/overdue` = a query over `recurring_templates`.
- `draft` = a query over `transactions`.

So there is **no write path and no schema change**. Read/unread state lives client-side
(one localStorage timestamp per user). This is the laziest thing that works; the known
ceiling is: read-state is per-device (no cross-device sync) and there is no history beyond
current state. Upgrade path: introduce a `notifications` table only when history or
cross-device sync is actually needed.

`worker.js` needs **no change to `processRecurring`** — the `draft` INSERT already sets
`recurring_id` (worker.js:973), so drafts are cleanly queryable as-is.

## Backend

One new route + handler in `worker.js`.

### Route
```
if (path === "/notifications" && method === "GET") return cors(await listNotifications(env, user));
```
Place alongside the other authed routes (after `requireAuth`, near the `/recurring` block).

### Handler `listNotifications(env, user)`
- If `user.role` is not `admin` or `staff` → `return json({ notifications: [] })`.
- `today = new Date().toISOString().slice(0,10)` (matches the existing worker convention;
  same UTC-date basis `processRecurring` already uses — see Timezone note).
- `horizon = today + 3 days`.
- Query A (due/overdue):
  ```sql
  SELECT * FROM recurring_templates
  WHERE workspace_id = ? AND is_active = 1 AND auto_create = 0
  ```
  For each row compute `eff = effectiveDue(row, today)`; keep only rows where
  `eff != null && eff <= horizon`. kind = `eff < today ? 'overdue' : 'due'`.
- Query B (draft):
  ```sql
  SELECT * FROM transactions
  WHERE workspace_id = ? AND is_draft = 1 AND recurring_id IS NOT NULL
  ORDER BY created_at DESC
  ```
- Build a unified array; sort by urgency: `overdue` → `due` → `draft`, then by date asc
  (soonest/oldest first).
- Return `json({ notifications: [...] })`.

### Notification shape
```js
{
  id,        // stable key for client read-state (see below)
  kind,      // 'overdue' | 'due' | 'draft'
  name,      // recurring/tx name
  amount,    // number
  type,      // 'income' | 'expense'
  dueDate,   // 'YYYY-MM-DD' (due/overdue) — the effective due date; null for draft
  sortDate,  // 'YYYY-MM-DD' used only for ordering within a kind
  refId,     // recurring id (due/overdue) or tx id (draft)
}
```
- `id`: `due:<recId>:<eff>` / `overdue:<recId>:<eff>` / `draft:<txId>`. Deterministic so the
  same live item keeps the same id across polls (read-state stays stable), and a new period
  (new `eff`) yields a new id (re-alerts next month). This id — not any timestamp — is the
  basis for unread state.
- `sortDate`: `dueDate` for due/overdue; the tx `date` for draft. Ordering only.

### `effectiveDue(rec, today)` helper (worker.js)
The soonest due date to alert on. `calcNextDueDate` is **not** reusable here — it returns the
period strictly *after* fromDate, which would skip the current period.
- If `rec.next_due_date` is set → return it verbatim.
- Else if `rec.frequency === 'monthly'` → this month's `due_day`, clamped to the month length:
  `YYYY-MM-min(due_day, daysInMonth)`. (Covers the dominant bill case even when no start date
  was set. If it already passed this month, it surfaces as `overdue` — acceptable heuristic.)
- Else → `null` (weekly/daily/yearly store only `due_day` 1–31, not enough to infer a date;
  skip unless the user set an explicit `next_due_date`).

This is the only non-trivial logic and gets a self-check (see Testing).

## Frontend

### `src/api.js`
```js
notifications: () => req('GET', '/notifications'),
```

### `useNotifications` hook (new, small) — used once in `Layout`
- State: `list`, `seen` (a Set of ids from localStorage), derived `unreadCount`.
- Fetch on mount, on `window` `focus`, and on an interval (~5 min). No WebSocket
  (cron auto-posts don't broadcast anyway; focus-refetch is enough).
- Read-state is **id-based**, not timestamp-based (a due item's date can be in the future, so
  a `ts > lastSeen` scheme would never mark it read on open):
  - `unreadCount` = count of `list` items whose `id` is not in `seen`.
  - `markAllRead()` → `seen = new Set(list.map(n => n.id))` (i.e. every currently shown item
    becomes read; this also prunes stale ids so localStorage stays bounded), persist to
    `localStorage['ft_notif_seen_' + userId]` as a JSON array. Called when the panel opens.
  - A new period yields a new `id` → re-appears as unread next month automatically.
- Only fetches when `user.role` is admin/staff (else no-op, empty).

### `src/components/NotificationBell.jsx` (new)
- Trigger: `Bell` (lucide-react) button + red badge showing `unreadCount` (hidden if 0).
- Panel: click opens a **fixed-position** dropdown with a backdrop (same pattern as the
  existing modal in `Recurring.jsx`, so the narrow `w-56` sidebar can't clip it). Opening the
  panel calls `markAllRead()`.
- Rows: icon+color per kind (overdue=red, due=amber, draft=blue), name, a short Thai
  description, amount. Unread rows get a left emerald dot + faint emerald tint.
- Row click → navigate: `due`/`overdue` → `/recurring`; `draft` → `/transactions`. Then close.
- Empty state: friendly "ไม่มีรายการค้าง".
- "อ่านแล้วทั้งหมด" action in the header (also implicit on open).
- Matches app theme: card `#161b2e`, borders `#1f2937`/`#2e3349`, emerald accents, slate text.
  Includes the same focus-visible + reduced-motion a11y block used on other pages.

### `src/Layout.jsx` wiring
- Call `useNotifications(user)` once in `Layout`.
- Render `<NotificationBell .../>` in two spots, guarded by `isAdmin || isStaff`:
  - desktop: top-right of the sidebar header row (next to the 💼 brand block).
  - mobile: in the existing top bar, left of the hamburger button.
- Both bells share the one hook's state (pass `list`, `unreadCount`, `markAllRead` as props),
  so there is a single fetch/poll — the two render spots are just triggers.

## Data flow

```
cron/processRecurring (unchanged) ──► DB (recurring_templates, transactions[is_draft])
                                        │
Layout mount / window focus / 5-min ───► GET /notifications (derive due/overdue + draft)
                                        │
                                        ▼
                        useNotifications ──► NotificationBell (badge + panel)
                        read-state: localStorage ft_notif_seen_<userId>
```

## Error handling
- `/notifications` failure → hook keeps last good list, logs quietly; bell shows no badge
  rather than crashing the shell. (The app-wide layout must never break on a bell error.)
- Empty/no-permission → empty list, bell with no badge (still rendered for admin/staff;
  simply nothing to show).

## Testing
- **Self-check for `effectiveDue`** (the money/date logic) — a tiny assert-based check in the
  style of `src/fmt.test.mjs` (Node, no framework), or an inline `demo()` in the worker:
  - monthly, `next_due_date=null`, `due_day=15`, today=`2026-07-19` → `2026-07-15`
    (and classified `overdue`).
  - monthly, `next_due_date=null`, `due_day=25`, today=`2026-07-19` → `2026-07-25`
    (classified `due`, within horizon) / outside horizon if today were early in month.
  - `next_due_date` set → returned verbatim regardless of frequency.
  - weekly/daily/yearly with `next_due_date=null` → `null` (skipped).
  - month-length clamp: `due_day=31` in February → last day of Feb.
- Manual verification (per repo `verify` habit): create an `auto_create=0` monthly recurring
  due within 3 days and a `draft_mode` recurring that has produced a draft; confirm the bell
  badge count and panel rows; confirm clicking navigates; confirm "อ่านแล้วทั้งหมด" clears the
  badge and it stays cleared on refresh.

## Timezone note
`effectiveDue`/`today` use the worker's existing `toISOString()` UTC-date basis — the same one
`processRecurring` and `triggerRecurring` already use. This keeps the notion of "today"
consistent with when items actually fire. A known ±1-day edge exists during Thai 00:00–07:00
(UTC still previous day); this matches current system behavior and is out of scope to change
here.

## Files touched
- `worker.js` — add route + `listNotifications` + `effectiveDue` (no `processRecurring` change).
- `src/api.js` — add `notifications`.
- `src/useNotifications.js` — new hook.
- `src/components/NotificationBell.jsx` — new component.
- `src/Layout.jsx` — wire hook + render bell (desktop sidebar header + mobile top bar).
- `src/effectiveDue.test.mjs` (or worker inline demo) — self-check for the date logic.
