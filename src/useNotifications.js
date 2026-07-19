import { useState, useEffect, useCallback } from 'react'
import { api } from './api'

const POLL_MS = 5 * 60 * 1000
const key = (uid) => `ft_notif_seen_${uid || 'anon'}`
const load = (uid) => {
  try { return new Set(JSON.parse(localStorage.getItem(key(uid)) || '[]')) }
  catch { return new Set() }
}

// Derives in-app notifications for the current user. Read-state is id-based (a Set of "seen"
// ids in localStorage per user) — a due item's date can be in the future, so a
// timestamp-based scheme would never mark it read on open.
export function useNotifications(user) {
  const canSee = user?.role === 'admin' || user?.role === 'staff'
  const uid = user?.id
  const [list, setList] = useState([])
  // Seen ids tracked with the uid they belong to, so switching user reloads read-state
  // during render (the documented pattern) instead of via a setState-in-effect.
  const [tracked, setTracked] = useState(() => ({ uid, seen: load(uid) }))
  if (tracked.uid !== uid) setTracked({ uid, seen: load(uid) })
  const seen = tracked.seen

  // Only ever setState after the await, so nothing runs synchronously inside the effect.
  const refetch = useCallback(async () => {
    try {
      const { notifications } = await api.notifications()
      setList(notifications || [])
    } catch { /* keep last good list; the bell must never break the app shell */ }
  }, [])

  // fetch on mount, on window focus, and every POLL_MS — only for viewers
  useEffect(() => {
    if (!canSee) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load of a polled subscription; setState is async (post-fetch)
    refetch()
    const onFocus = () => refetch()
    window.addEventListener('focus', onFocus)
    const iv = setInterval(refetch, POLL_MS)
    return () => { window.removeEventListener('focus', onFocus); clearInterval(iv) }
  }, [canSee, refetch])

  const items = canSee ? list : [] // derive empty for non-viewers instead of clearing via setState
  const unreadCount = items.reduce((n, x) => n + (seen.has(x.id) ? 0 : 1), 0)

  const markAllRead = useCallback(() => {
    const ids = new Set((canSee ? list : []).map(x => x.id)) // = current ids (also prunes stale)
    setTracked(t => ({ ...t, seen: ids }))
    try { localStorage.setItem(key(uid), JSON.stringify([...ids])) } catch { /* ignore quota */ }
  }, [canSee, list, uid])

  return { list: items, unreadCount, seen, markAllRead }
}
