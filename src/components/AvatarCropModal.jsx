import { useEffect, useRef, useState, useCallback } from 'react'
import { X, ZoomIn, Loader2 } from 'lucide-react'

const CROP = 260 // on-screen crop circle (px)
const OUT = 256  // output image size (px)

// Dependency-free avatar cropper: drag to pan, slider to zoom, exports a square
// 256px JPEG data URL. The parent owns the file pick + the save API call.
export default function AvatarCropModal({ file, saving, onCancel, onSave }) {
  const [url] = useState(() => URL.createObjectURL(file)) // created once on mount
  const [img, setImg] = useState(null)
  const [baseScale, setBaseScale] = useState(1) // "cover" scale at zoom=1
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef(null)

  useEffect(() => {
    const im = new Image()
    im.onload = () => {
      const bs = Math.max(CROP / im.naturalWidth, CROP / im.naturalHeight)
      setImg(im); setBaseScale(bs); setZoom(1); setOffset({ x: 0, y: 0 })
    }
    im.src = url
    return () => URL.revokeObjectURL(url)
  }, [url])

  // Keep the image covering the crop circle (no empty edges).
  const clamp = useCallback((off, z) => {
    if (!img) return off
    const dW = img.naturalWidth * baseScale * z
    const dH = img.naturalHeight * baseScale * z
    const mx = Math.max(0, (dW - CROP) / 2)
    const my = Math.max(0, (dH - CROP) / 2)
    return { x: Math.min(mx, Math.max(-mx, off.x)), y: Math.min(my, Math.max(-my, off.y)) }
  }, [img, baseScale])

  const onPointerDown = (e) => {
    drag.current = { sx: e.clientX, sy: e.clientY, ox: offset.x, oy: offset.y }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    const nx = drag.current.ox + (e.clientX - drag.current.sx)
    const ny = drag.current.oy + (e.clientY - drag.current.sy)
    setOffset(clamp({ x: nx, y: ny }, zoom))
  }
  const onPointerUp = () => { drag.current = null }

  const changeZoom = (z) => { setZoom(z); setOffset(o => clamp(o, z)) }

  const save = () => {
    if (!img) return
    const scale = baseScale * zoom
    const dW = img.naturalWidth * scale
    const dH = img.naturalHeight * scale
    const imgLeft = CROP / 2 + offset.x - dW / 2
    const imgTop = CROP / 2 + offset.y - dH / 2
    const sSize = CROP / scale
    const canvas = document.createElement('canvas')
    canvas.width = OUT; canvas.height = OUT
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#0d1120'; ctx.fillRect(0, 0, OUT, OUT)
    ctx.drawImage(img, (0 - imgLeft) / scale, (0 - imgTop) / scale, sSize, sSize, 0, 0, OUT, OUT)
    onSave(canvas.toDataURL('image/jpeg', 0.85))
  }

  const dW = img ? img.naturalWidth * baseScale * zoom : 0
  const dH = img ? img.naturalHeight * baseScale * zoom : 0

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50">
      <div className="w-full sm:max-w-sm sm:mx-4 rounded-t-2xl sm:rounded-2xl flex flex-col" style={{ background: '#161b2e', border: '1px solid #2e3349' }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid #1f2937' }}>
          <h3 className="font-semibold text-slate-200">ปรับรูปโปรไฟล์</h3>
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-300 p-1"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500 text-center">ลากรูปเพื่อเลื่อน · ใช้แถบด้านล่างเพื่อซูม</p>
          <div className="mx-auto relative overflow-hidden touch-none select-none"
            style={{ width: CROP, height: CROP, borderRadius: '50%', background: '#0d1120', cursor: 'grab' }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
            {img && url && (
              <img src={url} alt="" draggable={false}
                style={{ position: 'absolute', width: dW, height: dH, maxWidth: 'none',
                  left: CROP / 2 + offset.x - dW / 2, top: CROP / 2 + offset.y - dH / 2 }} />
            )}
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: 'inset 0 0 0 2px rgba(16,185,129,0.6)', pointerEvents: 'none' }} />
          </div>
          <div className="flex items-center gap-3">
            <ZoomIn className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <input type="range" min="1" max="3" step="0.01" value={zoom}
              onChange={e => changeZoom(parseFloat(e.target.value))}
              className="flex-1 accent-emerald-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={onCancel} disabled={saving}
              className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-slate-300 border border-slate-600 hover:bg-white/5 disabled:opacity-50">
              ยกเลิก
            </button>
            <button onClick={save} disabled={!img || saving}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-semibold flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> กำลังบันทึก...</> : 'บันทึกรูป'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
