import { useEffect, useRef } from 'react'

const WS_BASE = 'wss://fintrack-api.iamcreatle.workers.dev/ws'

export function useWs(onMessage) {
  const wsRef = useRef(null)
  const retryRef = useRef(0)
  const cbRef = useRef(onMessage)
  cbRef.current = onMessage

  useEffect(() => {
    const token = localStorage.getItem('ft_token')
    if (!token) return

    let destroyed = false

    function connect() {
      if (destroyed) return
      const ws = new WebSocket(`${WS_BASE}?token=${token}`)
      wsRef.current = ws

      ws.onmessage = (e) => {
        try { cbRef.current(JSON.parse(e.data)) } catch {}
      }

      ws.onclose = () => {
        if (destroyed) return
        const delay = Math.min(1000 * 2 ** retryRef.current, 30000)
        retryRef.current++
        setTimeout(connect, delay)
      }

      ws.onopen = () => { retryRef.current = 0 }
    }

    connect()
    return () => {
      destroyed = true
      wsRef.current?.close()
    }
  }, [])
}
