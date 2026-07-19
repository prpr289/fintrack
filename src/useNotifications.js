import { useState, useEffect, useCallback } from 'react'
import { api } from './api'

const POLL_MS = 5 * 60 * 1000
const seenKey = (uid) => `ft_notif_seen_${uid || 'anon'}`
const setKey = (uid) => `ft_notif_settings_${uid || 'anon'}`
const DEFAULTS = { days: 7, kinds: { upcoming: true, manual: true, draft: true } }

const loadSeen = (uid) => {
  try { return new Set(JSON.parse(localStorage.getItem(seenKey(uid)) || '[]')) }
  catch { return new Set() }
}
const loadSettings = (uid) => {
  try {
    const p = JSON.parse(localStorage.getItem(setKey(uid)) || '{}')
    return { days: p.days || DEFAULTS.days, kinds: { ...DEFAULTS.kinds, ...(p.kinds || {}) } }
  } catch { return { days: DEFAULTS.days, kinds: { ...DEFAULTS.kinds } } }
}

// Derives in-app notifications + owns per-user view settings.
// Read-state and view prefs (lead-time days, kind toggles) live in localStorage per user.
// Mute is server-side (recurring_templates.notify_muted) so it persists and is workspace-wide.
export function useNotifications(user) {
  const canSee = user?.role === 'admin' || user?.role === 'staff'
  const uid = user?.id
  const [list, setList] = useState([])
  // seen ids + settings tracked with their uid, reloaded during render (documented pattern)
  const [tracked, setTracked] = useState(() => ({ uid, seen: loadSeen(uid), settings: loadSettings(uid) }))
  if (tracked.uid !== uid) setTracked({ uid, seen: loadSeen(uid), settings: loadSettings(uid) })
  const { seen, settings } = tracked
  const days = settings.days

  const refetch = useCallback(async () => {
    try {
      const { notifications } = await api.notifications(days)
      setList(notifications || [])
    } catch { /* keep last good list; the bell must never break the app shell */ }
  }, [days])

  useEffect(() => {
    if (!canSee) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load of a polled subscription; setState is async (post-fetch)
    refetch()
    const onFocus = () => refetch()
    window.addEventListener('focus', onFocus)
    const iv = setInterval(refetch, POLL_MS)
    return () => { window.removeEventListener('focus', onFocus); clearInterval(iv) }
  }, [canSee, refetch])

  // kind filter: overdue/due => "manual", upcoming => auto, draft => draft
  const kindOn = (k) => k === 'draft' ? settings.kinds.draft : k === 'upcoming' ? settings.kinds.upcoming : settings.kinds.manual
  const items = (canSee ? list : []).filter(n => kindOn(n.kind))
  const unreadCount = items.reduce((n, x) => n + (seen.has(x.id) ? 0 : 1), 0)

  const persist = (patch) => {
    const next = { ...settings, ...patch }
    setTracked(t => ({ ...t, settings: next }))
    try { localStorage.setItem(setKey(uid), JSON.stringify(next)) } catch { /* ignore quota */ }
  }

  const markAllRead = () => {
    const ids = new Set(items.map(x => x.id))
    setTracked(t => ({ ...t, seen: ids }))
    try { localStorage.setItem(seenKey(uid), JSON.stringify([...ids])) } catch { /* ignore quota */ }
  }
  const setDays = (d) => persist({ days: d })
  const toggleKind = (k) => persist({ kinds: { ...settings.kinds, [k]: !settings.kinds[k] } })

  // Mute is a property of the recurring template (server-side, workspace-wide).
  const mute = async (refId) => { try { await api.updateRecurring(refId, { notifyMuted: true }); await refetch() } catch { /* ignore */ } }
  const unmute = async (refId) => { try { await api.updateRecurring(refId, { notifyMuted: false }); await refetch() } catch { /* ignore */ } }
  const getMuted = async () => { try { const { recurring } = await api.recurring(); return (recurring || []).filter(r => r.notifyMuted) } catch { return [] } }

  return { list: items, unreadCount, seen, markAllRead, settings, setDays, toggleKind, mute, unmute, getMuted }
}
