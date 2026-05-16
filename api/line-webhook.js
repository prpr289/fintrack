import crypto from 'crypto'

const LINE_SECRET = process.env.LINE_CHANNEL_SECRET
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
const FINTRACK_URL = process.env.FINTRACK_API_URL || 'https://fintrack-api.iamcreatle.workers.dev'
const FINTRACK_TOKEN = process.env.FINTRACK_TOKEN

export const config = { api: { bodyParser: false } }

// ── Helpers ────────────────────────────────────────────────

async function getRawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

function verifySignature(rawBody, sig) {
  const hash = crypto.createHmac('sha256', LINE_SECRET).update(rawBody).digest('base64')
  return hash === sig
}

function thb(n) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

// ── LINE API ───────────────────────────────────────────────

async function replyMessage(replyToken, messages) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ replyToken, messages }),
  })
}

async function pushMessage(userId, messages) {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LINE_TOKEN}` },
    body: JSON.stringify({ to: userId, messages }),
  })
}

async function downloadImage(messageId) {
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${LINE_TOKEN}` },
  })
  if (!res.ok) throw new Error('ดาวน์โหลดรูปไม่สำเร็จ')
  return Buffer.from(await res.arrayBuffer())
}

// ── Claude OCR ─────────────────────────────────────────────

async function ocrSlip(imageBuffer) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: imageBuffer.toString('base64') },
          },
          {
            type: 'text',
            text: `อ่านรูปนี้แล้วตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น:
{
  "is_slip": true หรือ false,
  "slip_type": "transfer" หรือ "receipt",
  "amount": ตัวเลข (บาท ไม่มี comma),
  "date": "YYYY-MM-DD" หรือ null,
  "recipient_name": "ชื่อผู้รับ" หรือ null,
  "bank": "ชื่อธนาคาร" หรือ null,
  "reference": "เลขอ้างอิง" หรือ null
}
ถ้าไม่ใช่สลิปโอนเงินหรือใบเสร็จให้ตอบ {"is_slip":false}`,
          },
        ],
      }],
    }),
  })

  if (!res.ok) throw new Error('OCR ล้มเหลว')
  const data = await res.json()
  const text = data.content?.[0]?.text || ''
  try {
    const match = text.match(/\{[\s\S]*\}/)
    return match ? JSON.parse(match[0]) : null
  } catch {
    return null
  }
}

// ── Fintrack API ────────────────────────────────────────────

async function fintrack(method, path, body) {
  const res = await fetch(`${FINTRACK_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${FINTRACK_TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

async function uploadSlip(txId, imageBuffer, messageId, slipType) {
  const params = new URLSearchParams({ type: slipType, name: `slip-${messageId}.jpg` })
  await fetch(`${FINTRACK_URL}/transactions/${txId}/slips?${params}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${FINTRACK_TOKEN}`, 'Content-Type': 'image/jpeg' },
    body: imageBuffer,
  })
}

// ── Event Handlers ─────────────────────────────────────────

async function handleImage(event) {
  const { replyToken, message, source } = event
  const userId = source.userId
  const today = new Date().toISOString().slice(0, 10)

  await replyMessage(replyToken, [{ type: 'text', text: '🔍 กำลังอ่านสลิป รอสักครู่...' }])

  try {
    const imageBuffer = await downloadImage(message.id)
    const ocr = await ocrSlip(imageBuffer)

    if (!ocr?.is_slip || !ocr?.amount) {
      await pushMessage(userId, [{
        type: 'text',
        text: '⚠️ อ่านสลิปไม่ได้ครับ\nกรุณาถ่ายรูปใหม่ให้ชัดขึ้น ไม่มีเงาหรือภาพเบลอ',
      }])
      return
    }

    const txDate = ocr.date || today
    const txName = ocr.recipient_name ? `โอนให้ ${ocr.recipient_name}` : 'รายการจากสลิป'

    const txData = await fintrack('POST', '/transactions', {
      name: txName,
      amount: ocr.amount,
      type: 'expense',
      scope: 'business',
      date: txDate,
      note: ocr.reference ? `อ้างอิง: ${ocr.reference}` : undefined,
    })

    const txId = txData.transaction?.id
    if (txId) {
      const slipType = ocr.slip_type === 'transfer' ? 'transfer' : 'receipt'
      await uploadSlip(txId, imageBuffer, message.id, slipType)
    }

    const lines = [
      '✅ บันทึกแล้วครับ',
      '',
      `💰 ยอด:    ฿${thb(ocr.amount)}`,
      `👤 ผู้รับ:  ${ocr.recipient_name || '-'}`,
      `🏦 ธนาคาร: ${ocr.bank || '-'}`,
      `📅 วันที่:  ${txDate}`,
      ocr.reference && `📋 อ้างอิง: ${ocr.reference}`,
      '',
      '🔗 fintrack-frontend-d6m.pages.dev',
    ].filter(Boolean).join('\n')

    await pushMessage(userId, [{ type: 'text', text: lines }])
  } catch (err) {
    console.error('handleImage error:', err)
    await pushMessage(userId, [{
      type: 'text',
      text: `❌ เกิดข้อผิดพลาด: ${err.message}\nกรุณาลองใหม่อีกครั้งครับ`,
    }])
  }
}

async function handleText(event) {
  const { replyToken, message, source } = event
  const text = message.text.trim()
  const today = new Date().toISOString().slice(0, 10)

  if (['ช่วยเหลือ', 'help', '?', 'menu'].includes(text.toLowerCase())) {
    await replyMessage(replyToken, [{
      type: 'text',
      text: [
        '📋 คำสั่งที่ใช้ได้',
        '',
        '📸 ส่งรูปสลิป → บันทึกรายการอัตโนมัติ',
        '💬 "ยอดวันนี้" → ดูยอดรายรับ/จ่ายวันนี้',
        '💬 "รายการล่าสุด" → 5 รายการล่าสุด',
        '💬 "ช่วยเหลือ" → แสดงคำสั่งทั้งหมด',
      ].join('\n'),
    }])
    return
  }

  if (text === 'ยอดวันนี้') {
    const data = await fintrack('GET', `/transactions?from=${today}&to=${today}&limit=1000`)
    const txs = data.transactions || []
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    await replyMessage(replyToken, [{
      type: 'text',
      text: [
        `📊 ยอดวันนี้ (${today})`,
        '',
        `✅ รายรับ:  ฿${thb(income)}`,
        `❌ รายจ่าย: ฿${thb(expense)}`,
        `💰 สุทธิ:   ฿${thb(income - expense)}`,
        `📝 ${txs.length} รายการ`,
      ].join('\n'),
    }])
    return
  }

  if (text === 'รายการล่าสุด') {
    const data = await fintrack('GET', '/transactions?limit=5')
    const txs = data.transactions || []
    const list = txs.length
      ? txs.map((t, i) => `${i + 1}. ${t.name}\n   ${t.type === 'income' ? '+' : '-'}฿${thb(t.amount)} · ${t.date}`).join('\n\n')
      : 'ยังไม่มีรายการ'
    await replyMessage(replyToken, [{
      type: 'text',
      text: `📋 5 รายการล่าสุด\n\n${list}`,
    }])
    return
  }

  await replyMessage(replyToken, [{
    type: 'text',
    text: '📸 ส่งรูปสลิปมาได้เลยครับ\nหรือพิมพ์ "ช่วยเหลือ" เพื่อดูคำสั่งทั้งหมด',
  }])
}

// ── Main Handler ───────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody = await getRawBody(req)
  const sig = req.headers['x-line-signature']

  if (!sig || !verifySignature(rawBody, sig)) {
    return res.status(401).json({ error: 'Invalid signature' })
  }

  // ตอบ 200 ทันที — LINE ต้องการ response เร็ว
  res.status(200).json({ ok: true })

  const { events = [] } = JSON.parse(rawBody.toString())

  for (const event of events) {
    try {
      if (event.type !== 'message') continue
      if (event.message.type === 'image') await handleImage(event)
      else if (event.message.type === 'text') await handleText(event)
    } catch (err) {
      console.error('Event error:', err)
    }
  }
}
