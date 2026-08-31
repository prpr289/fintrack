import { useRef } from 'react'

// กระดานเซ็นชื่อ — เดิมอยู่ใน PendingBills ใช้เฉพาะโหมดรับของ (พื้นเข้ม)
// ย้ายออกมาเพราะหน้าคู่ค้าต้องใช้ด้วย และหน้านั้นพื้นขาว หมึกต้องเป็นสีเข้ม
// ค่า default ตรงกับของเดิมทุกตัว เพื่อให้โหมดรับของทำงานเหมือนเดิมเป๊ะ
export default function SignaturePad({
  onChange,
  ink = '#e2e8f0',
  bg = '#0d1120',
  border = '#2e3349',
  height = 90,
  clearLabel = 'ล้าง เซ็นใหม่',
  clearClass = 'text-xs text-slate-500 mt-1',
}) {
  const ref = useRef(null)
  const drawing = useRef(false)

  const pos = (e) => {
    const c = ref.current, r = c.getBoundingClientRect()
    const t = e.touches?.[0] || e
    // canvas กว้างคงที่ 300 แต่ถูกยืดเต็มกล่อง — ต้องแปลงพิกัดตามอัตราส่วน
    // ไม่งั้นเส้นจะเพี้ยนออกจากปลายนิ้วบนจอที่กว้างกว่า 300px
    return [(t.clientX - r.left) * (c.width / r.width), (t.clientY - r.top) * (c.height / r.height)]
  }

  const start = (e) => {
    e.preventDefault()
    drawing.current = true
    const ctx = ref.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(...pos(e))
  }

  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const ctx = ref.current.getContext('2d')
    ctx.lineTo(...pos(e))
    ctx.strokeStyle = ink
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  const end = () => {
    if (!drawing.current) return
    drawing.current = false
    ref.current.toBlob(b => onChange(b), 'image/png')
  }

  const clear = () => {
    const c = ref.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    onChange(null)
  }

  return (
    <div>
      <canvas ref={ref} width={300} height={height}
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
        style={{ width: '100%', height, background: bg, border: `1px solid ${border}`, borderRadius: 8, touchAction: 'none' }} />
      <button type="button" onClick={clear} className={clearClass}>{clearLabel}</button>
    </div>
  )
}
