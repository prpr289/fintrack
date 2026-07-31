import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { promptPayPayload } from '../../promptpay.mjs'

// วาด QR พร้อมเพย์จาก "เลข" ของร้าน ไม่ใช่จากรูปที่ร้านส่งมา
// ส่ง amount มาด้วย → QR จะพกยอดไปเลย คนจ่ายกรอกยอดผิดไม่ได้
// เลขที่ใช้ไม่ได้ → คืน null (ไม่โชว์ QR ที่สแกนแล้วเด้ง) ให้ฝั่งเรียกใช้จัดการเอง
export default function PromptPayQR({ promptpayId, amount, size = 148, label }) {
  const [src, setSrc] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    const payload = promptPayPayload(promptpayId, amount)
    if (!payload) { setSrc(null); setFailed(true); return }
    setFailed(false)
    QRCode.toDataURL(payload, { margin: 1, width: size * 2, errorCorrectionLevel: 'M' })
      .then(url => { if (alive) setSrc(url) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [promptpayId, amount, size])

  if (failed || !src) return null

  return (
    <div className="flex flex-col items-center gap-1.5">
      <img src={src} alt={`QR พร้อมเพย์${amount ? ` ยอด ${amount} บาท` : ''}`}
        width={size} height={size} className="rounded-lg bg-white" style={{ padding: 6 }} />
      {label !== null && (
        <p className="text-[11px] text-slate-500 text-center leading-snug">
          {label ?? (amount > 0 ? 'สแกนแล้วยอดขึ้นเอง' : 'พร้อมเพย์ · ไม่ระบุยอด')}
        </p>
      )}
    </div>
  )
}
