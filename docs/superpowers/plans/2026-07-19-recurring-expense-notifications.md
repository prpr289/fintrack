# Recurring Expense Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, user chose "ทำเลย"). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add an in-app notification bell (admin/staff) surfacing recurring expenses that are due/overdue and recurring drafts awaiting confirmation.

**Architecture:** Notifications are *derived live* from existing tables — no new table, no migration, no write path. One new authed worker route `GET /notifications`. Read/unread state is client-side (a Set of seen ids in localStorage, per user). A bell in the sidebar (desktop) + mobile top bar polls on mount/focus/5-min.

**Tech Stack:** Cloudflare Worker (D1) + React 19 + Vite + Tailwind v4 + lucide-react. Spec: `docs/superpowers/specs/2026-07-19-recurring-expense-notifications-design.md`.

## Global Constraints
- Audience: admin + staff only; other roles get `{ notifications: [] }`.
- No new dependencies. Match existing dark theme (`#0d0f17`/`#161b2e`, emerald, rounded-xl, lucide, slate text) and existing a11y blocks (focus-visible + `prefers-reduced-motion`).
- Two kinds only: `due`/`overdue` (from `recurring_templates`, `auto_create=0`) and `draft` (from `transactions`, `is_draft=1 AND recurring_id IS NOT NULL`). No `posted` (cut by user).
- Lead time fixed at 3 days. `worker.js` `processRecurring` is NOT modified.
- Money/date logic lives in `notif-due.mjs` and has one runnable check.

---

### Task 1: Shared date logic + test (TDD)

**Files:**
- Create: `notif-due.mjs`
- Test: `notif-due.test.mjs`

**Produces:** `effectiveDue(rec, today) -> 'YYYY-MM-DD'|null`, `addDays(dateStr, n) -> 'YYYY-MM-DD'`.

- [ ] **Step 1: Write the failing test** — `notif-due.test.mjs`

```js
// Run: node notif-due.test.mjs
import assert from 'node:assert'
import { addDays, effectiveDue } from './notif-due.mjs'

assert.strictEqual(addDays('2026-07-19', 3), '2026-07-22')
assert.strictEqual(addDays('2026-07-30', 3), '2026-08-02')   // month rollover
assert.strictEqual(addDays('2026-12-31', 1), '2027-01-01')   // year rollover

// explicit next_due_date wins for any frequency
assert.strictEqual(effectiveDue({ next_due_date: '2026-08-01', frequency: 'weekly', due_day: 3 }, '2026-07-19'), '2026-08-01')
// monthly, no next_due_date -> this month's due_day
assert.strictEqual(effectiveDue({ next_due_date: null, frequency: 'monthly', due_day: 15 }, '2026-07-19'), '2026-07-15')
assert.strictEqual(effectiveDue({ next_due_date: null, frequency: 'monthly', due_day: 25 }, '2026-07-19'), '2026-07-25')
// clamp due_day 31 in February
assert.strictEqual(effectiveDue({ next_due_date: null, frequency: 'monthly', due_day: 31 }, '2026-02-10'), '2026-02-28')
// non-monthly without next_due_date -> null
assert.strictEqual(effectiveDue({ next_due_date: null, frequency: 'weekly', due_day: 3 }, '2026-07-19'), null)
assert.strictEqual(effectiveDue({ next_due_date: null, frequency: 'daily', due_day: 1 }, '2026-07-19'), null)

console.log('notif-due.test.mjs OK')
```

- [ ] **Step 2: Run to verify it fails** — `node notif-due.test.mjs` → FAIL (module not found).

- [ ] **Step 3: Implement** — `notif-due.mjs`

```js
// Pure date helpers for recurring-expense notifications.
// Shared by worker.js (wrangler bundles the relative import) and notif-due.test.mjs.
// ponytail: dependency-free so the money/date logic has one runnable check.

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Soonest due date to alert on for a manual (auto_create=0) recurring template:
//  next_due_date set -> use verbatim (any frequency)
//  else monthly      -> this month's due_day, clamped to month length
//  else              -> null (weekly/daily/yearly store only day-of-month; can't infer)
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
```

- [ ] **Step 4: Run to verify pass** — `node notif-due.test.mjs` → `notif-due.test.mjs OK`.
- [ ] **Step 5: Commit** — `git add notif-due.mjs notif-due.test.mjs && git commit`.

---

### Task 2: Backend `GET /notifications`

**Files:** Modify `worker.js` — (a) import at top, (b) route near line 70, (c) `listNotifications` after `listRecurring`.

**Consumes:** `effectiveDue`, `addDays` (Task 1); existing `requireRole`, `json`, `env.DB`.
**Produces:** `{ notifications: Array<{ id, kind:'overdue'|'due'|'draft', name, amount, type, dueDate, sortDate, refId }> }`.

- [ ] **Step 1: Add import (line 1)** `import { effectiveDue, addDays } from "./notif-due.mjs";`
- [ ] **Step 2: Add route** after the `triggerMatch` route (~line 70):
  `if (path === "/notifications" && method === "GET") return cors(await listNotifications(env, user));`
- [ ] **Step 3: Add handler** after `__name(listRecurring, "listRecurring");`:

```js
async function listNotifications(env, user) {
  if (!requireRole(user, "admin", "staff")) return json({ notifications: [] });
  const today = new Date().toISOString().slice(0, 10);
  const horizon = addDays(today, 3);
  const out = [];
  const recs = await env.DB.prepare(
    "SELECT * FROM recurring_templates WHERE workspace_id = ? AND is_active = 1 AND auto_create = 0"
  ).bind(user.workspace_id).all();
  for (const r of recs.results || []) {
    const eff = effectiveDue(r, today);
    if (!eff || eff > horizon) continue;
    const kind = eff < today ? "overdue" : "due";
    out.push({ id: `${kind}:${r.id}:${eff}`, kind, name: r.name, amount: Number(r.amount), type: r.type, dueDate: eff, sortDate: eff, refId: r.id });
  }
  const drafts = await env.DB.prepare(
    "SELECT * FROM transactions WHERE workspace_id = ? AND is_draft = 1 AND recurring_id IS NOT NULL ORDER BY created_at DESC"
  ).bind(user.workspace_id).all();
  for (const t of drafts.results || []) {
    out.push({ id: `draft:${t.id}`, kind: "draft", name: t.name, amount: Number(t.amount), type: t.type, dueDate: null, sortDate: t.date, refId: t.id });
  }
  const order = { overdue: 0, due: 1, draft: 2 };
  out.sort((a, b) => (order[a.kind] - order[b.kind]) || (a.sortDate < b.sortDate ? -1 : a.sortDate > b.sortDate ? 1 : 0));
  return json({ notifications: out });
}
__name(listNotifications, "listNotifications");
```

- [ ] **Step 4: Verify** — `npx wrangler deploy --dry-run` bundles cleanly (or defer to deploy). Commit.

---

### Task 3: Frontend API + hook

**Files:** Modify `src/api.js`; Create `src/useNotifications.js`.
**Produces:** `api.notifications()`; `useNotifications(user) -> { list, unreadCount, seen, markAllRead }`.

- [ ] **Step 1:** In `src/api.js`, after the `triggerRecurring` line, add:
  `notifications: () => req('GET', '/notifications'),`
- [ ] **Step 2:** Create `src/useNotifications.js`:

```js
import { useState, useEffect, useCallback } from 'react'
import { api } from './api'

const POLL_MS = 5 * 60 * 1000
const key = (uid) => `ft_notif_seen_${uid || 'anon'}`
const load = (uid) => { try { return new Set(JSON.parse(localStorage.getItem(key(uid)) || '[]')) } catch { return new Set() } }

export function useNotifications(user) {
  const canSee = user?.role === 'admin' || user?.role === 'staff'
  const uid = user?.id
  const [list, setList] = useState([])
  const [seen, setSeen] = useState(() => load(uid))

  const refetch = useCallback(async () => {
    if (!canSee) { setList([]); return }
    try { const { notifications } = await api.notifications(); setList(notifications || []) }
    catch { /* keep last good list; the bell must never break the app shell */ }
  }, [canSee])

  useEffect(() => { setSeen(load(uid)) }, [uid])

  useEffect(() => {
    if (!canSee) { setList([]); return }
    refetch()
    const onFocus = () => refetch()
    window.addEventListener('focus', onFocus)
    const iv = setInterval(refetch, POLL_MS)
    return () => { window.removeEventListener('focus', onFocus); clearInterval(iv) }
  }, [canSee, refetch])

  const unreadCount = list.reduce((n, x) => n + (seen.has(x.id) ? 0 : 1), 0)

  const markAllRead = useCallback(() => {
    const ids = new Set(list.map(x => x.id))     // = current ids (also prunes stale)
    setSeen(ids)
    try { localStorage.setItem(key(uid), JSON.stringify([...ids])) } catch {}
  }, [list, uid])

  return { list, unreadCount, seen, markAllRead }
}
```

- [ ] **Step 3:** Commit.

---

### Task 4: NotificationBell component

**Files:** Create `src/components/NotificationBell.jsx`.
**Consumes:** props `{ list, unreadCount, seen, markAllRead, placement: 'sidebar'|'topbar' }`; `useNavigate`; `thb` from `../fmt`.

- [ ] **Step 1:** Create the component (full code in the repo file — trigger button + badge, fixed panel + scrim, per-kind icon chips (AlertTriangle/Clock/FileText), unread snapshot highlight on open, `markAllRead` on open, relative-date Thai copy, empty state, Esc/backdrop close, aria-labels, staggered fade honoring `prefers-reduced-motion`).
- [ ] **Step 2:** Commit.

---

### Task 5: Wire into Layout

**Files:** Modify `src/Layout.jsx`.

- [ ] **Step 1:** Import `NotificationBell` + `useNotifications`; call the hook once in `Layout`.
- [ ] **Step 2:** Render `<NotificationBell placement="sidebar" .../>` in the desktop sidebar header (only when `!mobile && (isAdmin||isStaff)`), and `<NotificationBell placement="topbar" .../>` in the mobile top bar (when `isAdmin||isStaff`), both sharing the one hook's state.
- [ ] **Step 3:** Verify `npm run build` + `npm run lint`; drive the app (`npm run dev`) to confirm bell + panel + navigation. Commit.

---

## Self-Review

**Spec coverage:** due/overdue (Task 2 query A + Task 1 `effectiveDue`) ✓; draft (Task 2 query B) ✓; admin/staff gate (Task 2) ✓; id-based read-state (Task 3) ✓; bell in sidebar+topbar (Task 5) ✓; effectiveDue self-check (Task 1) ✓; no `processRecurring` change ✓; no new table ✓.

**Placeholder scan:** Task 4's component body is written directly in the source file rather than duplicated here (it is long, UI-only, and DRY — the repo file is the source of truth); every logic-bearing task (1–3, 5) has complete code. No TBD/TODO.

**Type consistency:** notification shape `{ id, kind, name, amount, type, dueDate, sortDate, refId }` identical across Task 2 (producer), Task 3 (`list`), Task 4 (consumer). `markAllRead`/`seen`/`unreadCount`/`list` names consistent between Task 3 and Task 4.
