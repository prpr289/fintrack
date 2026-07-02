// Cloudflare Pages Function — LINE Webhook
// env vars: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN,
//           ANTHROPIC_API_KEY, FINTRACK_API_URL, FINTRACK_TOKEN

async function verifySignature(rawBody, signature, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const computed = await crypto.subtle.sign('HMAC', key, rawBody)
  const computedB64 = btoa(String.fromCharCode(...new Uint8Array(computed)))
  return computedB64 === signature
}

function thb(n) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function formatDateThai(dateStr) {
  if (!dateStr) return '-'
  try {
    const [y, m, d] = dateStr.split('-').map(Number)
    const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
                    'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
    return `${d} ${months[m - 1]} พ.ศ. ${y + 543}`
  } catch { return dateStr }
}

// ── LINE API ───────────────────────────────────────────────

async function replyMessage(replyToken, messages, token) {
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`[LINE replyMessage ${res.status}]`, body.slice(0, 500))
    return false
  }
  return true
}

async function pushMessage(userId, messages, token) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: userId, messages }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.error(`[LINE pushMessage ${res.status}]`, body.slice(0, 500))
  }
}

// Reply tokens expire (LINE allows ~1 min) and a failed reply is silent. Slow OCR/D1
// work can blow past that window, so fall back to push — the user always gets an answer.
// ponytail: push quota (paid) is only spent on the failed/slow path, not normal replies.
async function replyOrPush(event, messages, token) {
  if (await replyMessage(event.replyToken, messages, token)) return
  const to = event.source?.userId || event.source?.groupId || event.source?.roomId
  if (to) await pushMessage(to, messages, token)
}

async function downloadImage(messageId, token) {
  const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('ดาวน์โหลดรูปไม่สำเร็จ')
  return await res.arrayBuffer()
}

// ── Claude OCR ─────────────────────────────────────────────

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(binary)
}

async function ocrSlip(imageBuffer, apiKey) {
  const base64 = toBase64(imageBuffer)

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      thinking: { type: 'disabled' }, // Sonnet 5 defaults thinking on; off keeps content[0]=text and the call fast (reply-token safe)
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
          },
          {
            type: 'text',
            text: `คุณคือผู้เชี่ยวชาญอ่านเอกสารการเงินไทย อ่านรูปนี้แล้วระบุข้อมูลให้ถูกต้อง

== ประเภทเอกสารที่รองรับ ==
1. สลิปโอนเงินธนาคาร (transfer)
2. ใบกำกับภาษี / ใบเสร็จรับเงิน / ใบแจ้งหนี้ (receipt)

== สลิปโอนเงิน: วิธีระบุผู้รับเงิน (สำคัญมาก) ==
สลิปโอนเงินมี 2 ฝั่งเสมอ:
• ต้นทาง/ผู้โอน/From/จาก = คนส่งเงิน → "ไม่ใช่" recipient_name
• ปลายทาง/ผู้รับ/To/ถึง/ไปยัง = คนรับเงิน → นี่คือ recipient_name

คำที่บ่งบอกว่าเป็นผู้รับ: "ผู้รับ", "ปลายทาง", "บัญชีปลายทาง", "To", "ถึง", "ไปยัง", "ชื่อบัญชีผู้รับ"
คำที่บ่งบอกว่าเป็นผู้โอน: "ผู้โอน", "ต้นทาง", "บัญชีต้นทาง", "From", "จาก", "ชื่อบัญชีผู้โอน"
ถ้าเห็นลูกศร (→) ชื่อที่อยู่หลังลูกศร = ผู้รับ

รูปแบบสลิปธนาคารไทย: SCB / KBank / Krungthai / BBL / PromptPay

== ใบกำกับภาษี / ใบเสร็จรับเงิน ==
• recipient_name = ชื่อร้านค้า/บริษัทผู้ขาย (ผู้ออกเอกสาร) ไม่ใช่ผู้ซื้อ
• amount = ยอดรวมทั้งสิ้น (รวม VAT ถ้ามี) — ใช้ตัวเลขที่มากที่สุดในเอกสาร
• reference = เลขที่ใบกำกับภาษี / เลขที่ใบเสร็จ
• bank = null (ไม่ต้องระบุ)
• slip_type = "receipt"

ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอกจาก JSON:
{
  "is_slip": true หรือ false,
  "slip_type": "transfer" หรือ "receipt",
  "amount": ตัวเลข (บาท ไม่มี comma ไม่มีหน่วย),
  "date": "YYYY-MM-DD" หรือ null,
  "recipient_name": "ชื่อผู้รับเงิน หรือ ชื่อร้านค้า/บริษัทผู้ขาย" หรือ null,
  "bank": "ธนาคารของผู้รับ (เฉพาะสลิปโอนเงิน)" หรือ null,
  "reference": "เลขที่รายการ / เลขที่ใบกำกับ / เลขที่ใบเสร็จ" หรือ null
}
ถ้าไม่ใช่เอกสารการเงิน ตอบ {"is_slip":false}`,
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

async function fintrack(method, path, body, baseUrl, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

async function uploadSlip(txId, imageBuffer, messageId, slipType, baseUrl, token) {
  const params = new URLSearchParams({ type: slipType, name: `slip-${messageId}.jpg` })
  const res = await fetch(`${baseUrl}/transactions/${txId}/slips?${params}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
    body: imageBuffer,
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`uploadSlip ${res.status}: ${errText.slice(0, 200)}`)
  }
  const d = await res.json().catch(() => ({}))
  return d.slip?.id || null
}

// ── Wallet matching ────────────────────────────────────────

const BANK_ALIASES = [
  ['กสิกร', 'kbank', 'kasikorn'],
  ['ไทยพาณิชย์', 'scb'],
  ['กรุงเทพ', 'bbl', 'bangkok'],
  ['กรุงไทย', 'ktb', 'krungthai'],
  ['ทหารไทย', 'ttb', 'tmb'],
  ['ออมสิน', 'gsb'],
  ['ธกส', 'baac'],
  ['ยูโอบี', 'uob'],
  ['ซีไอเอ็มบี', 'cimb'],
  ['ซิตี้', 'citi'],
]

async function getWallets(baseUrl, token) {
  try {
    const res = await fintrack('GET', '/wallets', null, baseUrl, token)
    if (Array.isArray(res)) return res
    if (Array.isArray(res?.wallets)) return res.wallets
    console.error('[getWallets] unexpected response:', JSON.stringify(res).slice(0, 200))
    return []
  } catch (e) { console.error('[getWallets] error:', e?.message); return [] }
}

function matchWallet(bank, wallets) {
  if (!bank || !wallets.length) return null
  const b = bank.toLowerCase()
  const group = BANK_ALIASES.find(aliases => aliases.some(a => b.includes(a)))
  return wallets.find(w => {
    const name = (w.name || '').toLowerCase()
    if (group) return group.some(a => name.includes(a))
    return name.includes(b)
  }) || null
}

// ── Category matching ──────────────────────────────────────

async function getCategories(baseUrl, token) {
  try {
    const res = await fintrack('GET', '/categories', null, baseUrl, token)
    if (Array.isArray(res)) return res
    if (Array.isArray(res?.categories)) return res.categories
    console.error('[getCategories] unexpected response:', JSON.stringify(res).slice(0, 200))
    return []
  } catch (e) { console.error('[getCategories] error:', e?.message); return [] }
}

async function matchVendorHistory(name, txType = 'expense', baseUrl, token) {
  if (!name) return null
  try {
    const q = new URLSearchParams({ search: name, type: txType, limit: '20' })
    const res = await fintrack('GET', `/transactions?${q}`, null, baseUrl, token)
    const txs = (res.transactions || []).filter(t => t.categoryId || t.walletId)
    if (!txs.length) return null

    const freq = {}
    for (const t of txs) {
      const key = `${t.categoryId || ''}|${t.subCategoryId || ''}|${t.walletId || ''}`
      if (!freq[key]) freq[key] = { count: 0, tx: t }
      freq[key].count++
    }
    const top = Object.values(freq).sort((a, b) => b.count - a.count)[0].tx
    return {
      categoryId: top.categoryId || null,
      subCategoryId: top.subCategoryId || null,
      categoryName: top.categoryName || '',
      subCategoryName: top.subCategoryName || null,
      walletId: top.walletId || null,
      walletName: top.walletName || null,
      source: 'history',
    }
  } catch { return null }
}

async function suggestCategoryAI(name, amount, categories, apiKey) {
  if (!categories.length || !name) return null
  try {
    const mainCats = categories.filter(c => !c.parentId)
    const catList = mainCats.map(m => {
      const subs = categories.filter(c => c.parentId === m.id)
      const subLine = subs.length ? `\n   ย่อย: ${subs.map(s => `${s.name}(${s.id})`).join(', ')}` : ''
      return `- ${m.name}(${m.id})${subLine}`
    }).join('\n')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 120,
        thinking: { type: 'disabled' }, // 120-token budget can't afford thinking
        messages: [{
          role: 'user',
          content: `ชื่อผู้รับเงิน: "${name}"${amount ? `\nจำนวน: ${amount} บาท` : ''}\n\nหมวดหมู่ในระบบ:\n${catList}\n\nตอบ JSON เท่านั้น (ถ้าไม่แน่ใจให้ subCategoryId เป็น null): {"categoryId":"id","subCategoryId":"id หรือ null"}`,
        }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const match = (data.content?.[0]?.text || '').match(/\{[\s\S]*?\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0])
    const cat = categories.find(c => c.id === parsed.categoryId)
    if (!cat) return null
    const sub = parsed.subCategoryId ? categories.find(c => c.id === parsed.subCategoryId) : null
    return {
      categoryId: parsed.categoryId,
      subCategoryId: sub?.id || null,
      categoryName: cat.name,
      subCategoryName: sub?.name || null,
      source: 'ai',
    }
  } catch { return null }
}

// ── LINE User mapping ──────────────────────────────────────
async function lookupEmployee(lineUserId, baseUrl, token) {
  if (!lineUserId) return null
  try {
    const res = await fintrack('GET', `/line-users/lookup?lid=${encodeURIComponent(lineUserId)}`, null, baseUrl, token)
    return res.employee?.name || null
  } catch { return null }
}

async function registerEmployee(lineUserId, employeeName, lineDisplayName, baseUrl, token) {
  return fintrack('POST', '/line-users', { lineUserId, employeeName, lineDisplayName }, baseUrl, token)
}

async function matchVendorProfile(name, baseUrl, token) {
  if (!name) return null
  try {
    const q = new URLSearchParams({ name })
    const res = await fintrack('GET', `/vendor-profiles?${q}`, null, baseUrl, token)
    const vendors = res.vendors || []
    if (!vendors.length) return null
    // EXACT name match only — the API search is fuzzy (LIKE), and taking the
    // first fuzzy hit was matching the wrong vendor → wrong category.
    const v = vendors.find(x => (x.vendorName || '').toLowerCase() === name.toLowerCase())
    if (!v) return null
    if (!v.typicalCategoryId && !v.typicalWalletId) return null
    return {
      categoryId: v.typicalCategoryId || null,
      subCategoryId: v.typicalSubCategoryId || null,
      categoryName: v.typicalCategoryName || '',
      subCategoryName: v.typicalSubCategoryName || null,
      walletId: v.typicalWalletId || null,
      walletName: v.typicalWalletName || null,
      vendorTaxId: v.taxId || null,
      source: 'vendor_profile',
    }
  } catch { return null }
}

// Keyword rules first (deterministic, user-defined) — stops the bot guessing
// the wrong category from fuzzy vendor memory.
async function matchCategoryRuleLine(name, baseUrl, token) {
  if (!name) return null
  try {
    const res = await fintrack('GET', '/category-rules', null, baseUrl, token)
    const rules = res.rules || []
    if (!rules.length) return null
    const t = name.toLowerCase()
    let best = null
    for (const r of rules) {
      const kw = (r.keyword || '').toLowerCase().trim()
      if (!kw || !t.includes(kw) || !r.categoryId) continue
      const better = !best
        || (r.priority || 0) > (best.priority || 0)
        || ((r.priority || 0) === (best.priority || 0) && kw.length > (best.keyword || '').length)
      if (better) best = r
    }
    if (!best) return null
    return {
      categoryId: best.categoryId, subCategoryId: best.subCategoryId || null,
      categoryName: best.categoryName || '', subCategoryName: best.subCategoryName || null,
      source: 'rule',
    }
  } catch { return null }
}

async function resolveCat(name, amount, txType = 'expense', baseUrl, token, apiKey, preloadedCats = null) {
  const [fromRule, fromProfile, fromHistory, cats] = await Promise.all([
    matchCategoryRuleLine(name, baseUrl, token),
    matchVendorProfile(name, baseUrl, token),
    matchVendorHistory(name, txType, baseUrl, token),
    preloadedCats ? Promise.resolve(preloadedCats) : getCategories(baseUrl, token),
  ])
  if (fromRule) return fromRule
  if (fromProfile) return fromProfile
  if (fromHistory) return fromHistory
  return suggestCategoryAI(name, amount, cats, apiKey)
}

// ── Budget (R2) ────────────────────────────────────────────

async function getBudget(bucket) {
  if (!bucket) return {}
  try {
    const obj = await bucket.get('settings/budget.json')
    if (!obj) return {}
    return JSON.parse(await obj.text())
  } catch { return {} }
}

async function saveBudget(bucket, data) {
  await bucket.put('settings/budget.json', JSON.stringify(data), {
    httpMetadata: { contentType: 'application/json' },
  })
}

// ── Flex Message ───────────────────────────────────────────

function flexRow(label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#aaaaaa', flex: 3 },
      { type: 'text', text: String(value), size: 'sm', color: '#ffffff', wrap: true, flex: 5 },
    ],
  }
}

function buildConfirmFlex(ocr, messageId, today, memo = '', cat = null, wallet = null, txType = 'expense') {
  const txDate = ocr.date || today
  const name = (ocr.recipient_name || '').slice(0, 25)
  const bank = (ocr.bank || '').slice(0, 20)
  const ref = (ocr.reference || '').slice(0, 25)
  const slipType = ocr.slip_type || 'transfer'
  const memoTrimmed = (memo || '').slice(0, 40)
  const isIncome = txType === 'income'

  const confirmData = JSON.stringify({
    a: 'ok', m: messageId, amt: ocr.amount,
    d: txDate, n: name, b: bank, r: ref, t: slipType,
    ...(memoTrimmed ? { mo: memoTrimmed } : {}),
    ...(cat?.categoryId ? { c: cat.categoryId } : {}),
    ...(cat?.subCategoryId ? { s: cat.subCategoryId } : {}),
    ...(wallet?.id ? { wi: wallet.id } : {}),
    ...(isIncome ? { ty: 'income' } : {}),
  })

  const editFillIn = `/แก้|m=${messageId}|a=${ocr.amount}|d=${txDate}|b=${bank}|r=${ref}|t=${slipType}|n=${name}${memoTrimmed ? `|mo=${memoTrimmed}` : ''}`
  const autoMemoData = JSON.stringify({
    a: 'automemo', m: messageId, amt: ocr.amount, d: txDate,
    n: name, b: bank, r: ref, t: slipType,
    ...(wallet?.id ? { wi: wallet.id } : {}),
    ...(isIncome ? { ty: 'income' } : {}),
  })

  // tx snapshot for sub-flows (category/wallet selection, fliptype)
  const txSnap = {
    m: messageId, amt: ocr.amount, d: txDate,
    n: name.slice(0, 20), b: bank.slice(0, 15), r: ref.slice(0, 20), t: slipType,
    ...(memoTrimmed ? { mo: memoTrimmed.slice(0, 25) } : {}),
    ...(wallet?.id ? { wi: wallet.id } : {}),
    ...(cat?.categoryId ? { c: cat.categoryId } : {}),
    ...(cat?.subCategoryId ? { s: cat.subCategoryId } : {}),
    ...(isIncome ? { ty: 'income' } : {}),
  }
  const catMenuData = JSON.stringify({ a: 'catmenu', ...txSnap })
  const walletMenuData = JSON.stringify({ a: 'walletmenu', ...txSnap })

  const flippedType = isIncome ? 'expense' : 'income'
  const flipLabel = isIncome ? '💸 เปลี่ยนเป็นรายจ่าย' : '💚 เปลี่ยนเป็นรายรับ'
  const flipData = JSON.stringify({ a: 'fliptype', ...txSnap, ty: flippedType })

  const catLabel = cat
    ? `${cat.categoryName}${cat.subCategoryName ? ` › ${cat.subCategoryName}` : ''} (${cat.source === 'history' ? 'จากประวัติ' : cat.source === 'ai' ? 'AI แนะนำ' : 'เลือกเอง'})`
    : null

  const rows = [
    flexRow('💰 ยอด', `฿${thb(ocr.amount)}`),
    flexRow('💼 ประเภท', isIncome ? '💚 รายรับ' : '💸 รายจ่าย'),
    ocr.recipient_name && flexRow(isIncome ? '👤 จากใคร' : '👤 ผู้รับ', ocr.recipient_name),
    ocr.bank && flexRow('🏦 ธนาคาร', ocr.bank),
    flexRow('📅 วันที่', txDate),
    ocr.reference && flexRow('📋 อ้างอิง', ocr.reference),
    memoTrimmed && flexRow('📝 บันทึก', memoTrimmed),
    catLabel && flexRow('🏷️ หมวด', catLabel),
    wallet?.name && flexRow('👛 กระเป๋า', wallet.name),
  ].filter(Boolean)

  return {
    type: 'flex',
    altText: `ยืนยัน${isIncome ? 'รายรับ' : 'รายจ่าย'} ฿${thb(ocr.amount)}?`,
    contents: {
      type: 'bubble',
      styles: { body: { backgroundColor: '#1a2035' }, footer: { backgroundColor: '#1a2035' } },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: '📋 ตรวจสอบรายการ', weight: 'bold', size: 'md', color: '#ffffff' },
          { type: 'separator', margin: 'sm', color: '#2e3349' },
          { type: 'box', layout: 'vertical', margin: 'md', spacing: 'sm', contents: rows },
          {
            type: 'text',
            text: '✏️ แก้ไขข้อมูล · 📝 เพิ่มบันทึกช่วยจำก่อนยืนยัน',
            size: 'xs', color: '#6b7280', margin: 'md', wrap: true,
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '12px',
        contents: [
          {
            type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'postback', label: '✏️ แก้ไขข้อมูล', data: '{"a":"edit"}', inputOption: 'openKeyboard', fillInText: editFillIn },
          },
          {
            type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'postback', label: '📝 บันทึกอัตโนมัติ', data: autoMemoData },
          },
          {
            type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'postback', label: '🔄 เปลี่ยนหมวดหมู่', data: catMenuData },
          },
          {
            type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'postback', label: '👛 เปลี่ยนกระเป๋า', data: walletMenuData },
          },
          {
            type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'postback', label: flipLabel, data: flipData },
          },
          {
            type: 'box', layout: 'horizontal', spacing: 'sm',
            contents: [
              {
                type: 'button', style: 'secondary', height: 'sm',
                action: { type: 'postback', label: '❌ ยกเลิก', data: '{"a":"cancel"}' },
              },
              {
                type: 'button', style: 'primary', height: 'sm', color: '#10b981',
                action: { type: 'postback', label: '✅ ยืนยัน', data: confirmData },
              },
            ],
          },
        ],
      },
    },
  }
}

// ── R2 Voucher ─────────────────────────────────────────────

function generateVoucherHTML(d, slipBase64) {
  const amount = parseFloat(d.amt) || 0
  const isIncome = d.ty === 'income'
  const docPrefix = isIncome ? 'RV' : 'PV'
  const voucherNo = `${docPrefix}-${(d.d || '').replace(/-/g, '')}-${(d.id || 'XXXX').slice(-4).toUpperCase()}`
  const description = d.mo || (d.r ? `อ้างอิง: ${d.r}` : isIncome ? 'รับชำระค่าสินค้า/บริการ' : 'ชำระค่าสินค้า/บริการ')
  const docTitle = isIncome ? 'ใบรับเงิน' : 'ใบสำคัญจ่าย'
  const docSubtitle = isIncome ? 'Money Receipt' : 'Payment Voucher'
  const payToLabel = isIncome ? 'รับจาก / From' : 'จ่ายให้ / Pay to'
  const slipHtml = slipBase64
    ? `<div class="slip-section">
        <div class="slip-label">สลิปโอนเงิน / Payment Slip</div>
        <img src="data:image/jpeg;base64,${slipBase64}" alt="สลิป" class="slip-img">
       </div>`
    : ''
  const bankRef = (d.b || d.r)
    ? `<div class="bank-ref">${d.b ? `<span>ธนาคาร: ${d.b}</span>` : ''}${d.r ? `<span>เลขอ้างอิง: ${d.r}</span>` : ''}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="th"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${docTitle} ${voucherNo}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Sarabun',sans-serif;background:#f3f4f6;padding:1.5rem 1rem;font-size:14px;color:#111;line-height:1.6}
.wrap{max-width:680px;margin:0 auto;background:#fff;padding:2rem 2.5rem;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.1)}
.header{text-align:center;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:20px}
.title{font-size:1.5rem;font-weight:700}.subtitle{color:#6b7280;font-size:.85rem}
.meta{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;gap:1rem}
.shop-name{font-weight:700;font-size:1rem}
.shop-addr{color:#6b7280;font-size:.78rem;margin-top:4px;line-height:1.5}
.meta-right{text-align:right;font-size:.85rem;flex-shrink:0}
hr{border:none;border-top:1px solid #e5e7eb;margin:16px 0}
table{width:100%;border-collapse:collapse;margin-bottom:16px;table-layout:fixed}
th,td{border:1px solid #d1d5db;padding:6px 8px;vertical-align:top;word-break:break-word}
th{background:#f9fafb;font-weight:600;font-size:.85rem}
.total{background:#f9fafb;font-weight:700}
.bank-ref{font-size:.78rem;color:#6b7280;margin-bottom:16px;display:flex;flex-wrap:wrap;gap:16px}
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:48px}
.sig{text-align:center}.sig-line{border-bottom:1.5px solid #374151;height:40px;margin-bottom:6px}
.sig-label{font-weight:600;font-size:.82rem}.sig-date{color:#9ca3af;font-size:.72rem;margin-top:4px}
.slip-section{margin-top:28px;border-top:1.5px dashed #d1d5db;padding-top:16px;text-align:center}
.slip-label{font-size:.75rem;color:#6b7280;font-weight:600;margin-bottom:8px}
.slip-img{max-width:90%;max-height:280px;object-fit:contain;border:1px solid #e5e7eb;border-radius:6px}
@media print{body{background:white;padding:0}.wrap{box-shadow:none;border-radius:0;padding:0}.slip-img{max-height:86mm}}
@page{size:A4 portrait;margin:15mm 20mm}
</style></head>
<body><div class="wrap">
  <div class="header"><div class="title">${docTitle}</div><div class="subtitle">${docSubtitle}</div></div>
  <div class="meta">
    <div>
      <div class="shop-name">ร้านตำมั้ย</div>
      <div class="shop-addr">เลขที่ 21/33/1 ถนนแหลมสนอ่อน ตำบลบ่อยาง อำเภอเมือง จังหวัดสงขลา 90000</div>
    </div>
    <div class="meta-right">
      <div><span style="color:#6b7280">เลขที่: </span><strong>${voucherNo}</strong></div>
      <div><span style="color:#6b7280">วันที่: </span>${formatDateThai(d.d)}</div>
    </div>
  </div>
  <hr>
  <table>
    <colgroup><col style="width:2rem"><col><col style="width:7.5rem"><col style="width:7rem"></colgroup>
    <thead><tr>
      <th style="text-align:center">#</th>
      <th style="text-align:left">รายการ / Description</th>
      <th style="text-align:left">${payToLabel}</th>
      <th style="text-align:right">จำนวนเงิน (บาท)</th>
    </tr></thead>
    <tbody>
      <tr>
        <td style="text-align:center">1</td>
        <td>${description}</td>
        <td>${d.n || '-'}</td>
        <td style="text-align:right;font-weight:600">${thb(amount)}</td>
      </tr>
      <tr class="total">
        <td colspan="3" style="text-align:right">รวมทั้งสิ้น / Total</td>
        <td style="text-align:right">${thb(amount)}</td>
      </tr>
    </tbody>
  </table>
  ${bankRef}
  <div class="sigs">
    <div class="sig"><div class="sig-line"></div><div class="sig-label">ผู้รับเงิน / Received by</div><div class="sig-date">วันที่ ___ / ___ / ___</div></div>
    <div class="sig"><div class="sig-line"></div><div class="sig-label">ผู้อนุมัติ / Approved by</div><div class="sig-date">วันที่ ___ / ___ / ___</div></div>
  </div>
  ${slipHtml}
</div></body></html>`
}

const R2_PUBLIC_URL = 'https://pub-fda11f72262a4114a6140c309f9baac9.r2.dev'

async function uploadVoucherToR2(bucket, voucherNo, date, html) {
  const month = (date || '').slice(0, 7)
  const key = `${month}/${voucherNo}.html`
  await bucket.put(key, html, { httpMetadata: { contentType: 'text/html; charset=utf-8' } })
  return `${R2_PUBLIC_URL}/${month}/${voucherNo}.html`
}

// Body-only bubble (used when there are no options — an empty footer box is rejected by LINE).
function buildInfoBubble(title, text) {
  return {
    type: 'flex', altText: title,
    contents: {
      type: 'bubble',
      styles: { body: { backgroundColor: '#1a2035' } },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'md', color: '#ffffff' },
          { type: 'separator', margin: 'sm', color: '#2e3349' },
          { type: 'text', text, size: 'sm', color: '#cbd5e1', margin: 'md', wrap: true },
        ],
      },
    },
  }
}

// Render postback buttons as a single scrollable bubble, or a carousel of bubbles
// when there are many — so EVERY option is reachable (no silent truncation).
// 12 buttons/bubble × 12 bubbles = up to 144 options.
function buildButtonCarousel(title, helperText, allButtons) {
  if (allButtons.length === 0) return buildInfoBubble(title, helperText)
  const BTN_PER_BUBBLE = 12
  const MAX_BUBBLES = 8 // 96 options max — keeps the message well under LINE's 50KB limit
  if (allButtons.length > BTN_PER_BUBBLE * MAX_BUBBLES) {
    console.warn(`[buildButtonCarousel] "${title}" has ${allButtons.length} options, showing first ${BTN_PER_BUBBLE * MAX_BUBBLES}`)
  }
  const chunks = []
  for (let i = 0; i < allButtons.length && chunks.length < MAX_BUBBLES; i += BTN_PER_BUBBLE) {
    chunks.push(allButtons.slice(i, i + BTN_PER_BUBBLE))
  }
  const total = chunks.length
  const buildBubble = (btns, idx) => ({
    type: 'bubble',
    styles: { body: { backgroundColor: '#1a2035' }, footer: { backgroundColor: '#1a2035' } },
    body: {
      type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px',
      contents: [
        { type: 'text', text: title, weight: 'bold', size: 'md', color: '#ffffff' },
        { type: 'separator', margin: 'sm', color: '#2e3349' },
        {
          type: 'text',
          text: total > 1 ? `${helperText} (${idx + 1}/${total} ปัดดูหน้าถัดไป →)` : helperText,
          size: 'xs', color: '#6b7280', margin: 'sm', wrap: true,
        },
      ],
    },
    footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '12px', contents: btns },
  })
  if (total === 1) return { type: 'flex', altText: title, contents: buildBubble(chunks[0], 0) }
  return { type: 'flex', altText: title, contents: { type: 'carousel', contents: chunks.map((c, i) => buildBubble(c, i)) } }
}

function buildCatSelectFlex(cats, txSnap, step, selCatId = '') {
  const list = Array.isArray(cats) ? cats : []
  const isMain = step === 'main'
  const items = isMain
    ? list.filter(c => !c.parentId)
    : list.filter(c => c.parentId === selCatId)

  const title = isMain ? '🏷️ เลือกหมวดหมู่หลัก' : '🏷️ เลือกหมวดหมู่ย่อย'
  const makeData = (a, extraFields) => JSON.stringify({ a, ...txSnap, ...extraFields })

  const allButtons = items.map(cat => ({
    type: 'button', style: 'secondary', height: 'sm',
    action: {
      type: 'postback',
      label: (cat.name || 'หมวดหมู่').slice(0, 20),
      data: isMain
        ? makeData('catsel', { c: cat.id })
        : makeData('subcatsel', { c: selCatId, s: cat.id }),
    },
  }))

  if (!isMain) {
    allButtons.push({
      type: 'button', style: 'secondary', height: 'sm',
      action: { type: 'postback', label: '— ไม่ระบุหมวดย่อย', data: makeData('subcatsel', { c: selCatId, s: '' }) },
    })
  }

  if (allButtons.length === 0) {
    return buildInfoBubble(title, 'ยังไม่มีหมวดหมู่ให้เลือกครับ — เพิ่มหมวดหมู่ได้ที่หน้าเว็บ แล้วลองใหม่อีกครั้ง')
  }
  return buildButtonCarousel(title, 'เลือกได้เลยครับ', allButtons)
}

function buildWalletSelectFlex(wallets, txSnap) {
  const title = '👛 เลือกกระเป๋าเงิน'
  const makeData = (walletId) => {
    const snap = { ...txSnap }
    if (walletId) snap.wi = walletId
    else delete snap.wi
    return JSON.stringify({ a: 'walletsel', ...snap })
  }

  const list = Array.isArray(wallets) ? wallets : []
  const allButtons = list.map(w => ({
    type: 'button', style: 'secondary', height: 'sm',
    action: { type: 'postback', label: (w.name || 'กระเป๋า').slice(0, 20), data: makeData(w.id) },
  }))
  allButtons.push({
    type: 'button', style: 'secondary', height: 'sm',
    action: { type: 'postback', label: '— ไม่ระบุกระเป๋า', data: makeData(null) },
  })

  return buildButtonCarousel(title, 'เลือกกระเป๋าที่ต้องการบันทึกครับ', allButtons)
}

function buildDeleteConfirmFlex(txId, amt, name, date) {
  const delokData = JSON.stringify({ a: 'delok', id: txId })
  return {
    type: 'flex',
    altText: '⚠️ ยืนยันลบรายการ',
    contents: {
      type: 'bubble',
      size: 'kilo',
      styles: { body: { backgroundColor: '#1a2035' }, footer: { backgroundColor: '#1a2035' } },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '16px',
        contents: [
          { type: 'text', text: '⚠️ ยืนยันลบรายการ', weight: 'bold', color: '#ef4444', size: 'md' },
          { type: 'separator', margin: 'sm', color: '#2e3349' },
          { type: 'text', text: `฿${thb(parseFloat(amt) || 0)}${name ? ` · ${name}` : ''}\n${date || ''}`, color: '#ffffff', size: 'sm', margin: 'md', wrap: true },
          { type: 'text', text: 'รายการที่ลบแล้วไม่สามารถกู้คืนได้', size: 'xs', color: '#6b7280', margin: 'sm', wrap: true },
        ],
      },
      footer: {
        type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: '12px',
        contents: [
          {
            type: 'button', style: 'secondary', height: 'sm',
            action: { type: 'postback', label: '❌ ยกเลิก', data: '{"a":"cancel"}' },
          },
          {
            type: 'button', style: 'primary', height: 'sm', color: '#ef4444',
            action: { type: 'postback', label: '🗑️ ยืนยันลบ', data: delokData },
          },
        ],
      },
    },
  }
}

// ── Event Handlers ─────────────────────────────────────────

async function handleImage(event, env) {
  const { message } = event
  const today = new Date().toISOString().slice(0, 10)
  const baseUrl = env.FINTRACK_API_URL || 'https://fintrack-api.iamcreatle.workers.dev'

  const t0 = Date.now()
  const ms = label => console.log(`[TIMING] ${label}: ${Date.now() - t0}ms`)

  // Don't reply "กำลังอ่านสลิป" — save the replyToken for the actual flex confirm (push quota = paid)
  const walletsPromise = getWallets(baseUrl, env.FINTRACK_TOKEN).catch(() => [])
  const categoriesPromise = getCategories(baseUrl, env.FINTRACK_TOKEN).catch(() => [])

  try {
    ms('start')
    const imageBuffer = await downloadImage(message.id, env.LINE_CHANNEL_ACCESS_TOKEN)
    ms(`downloadImage (${imageBuffer.byteLength} bytes)`)

    const ocrStart = Date.now()
    const ocr = await ocrSlip(imageBuffer, env.ANTHROPIC_API_KEY)
    console.log(`[TIMING] ocrSlip: ${Date.now() - ocrStart}ms (model=sonnet-5)`)

    if (!ocr?.is_slip || !ocr?.amount) {
      await replyOrPush(event, [{
        type: 'text',
        text: '⚠️ อ่านสลิปไม่ได้ครับ\nกรุณาถ่ายรูปใหม่ให้ชัดขึ้น ไม่มีเงาหรือภาพเบลอ',
      }], env.LINE_CHANNEL_ACCESS_TOKEN)
      return
    }

    const fetchStart = Date.now()
    const [wallets, categories] = await Promise.all([walletsPromise, categoriesPromise])
    console.log(`[TIMING] wallets+cats fetch: ${Date.now() - fetchStart}ms`)

    const catStart = Date.now()
    const cat = await resolveCat(ocr.recipient_name, ocr.amount, 'expense', baseUrl, env.FINTRACK_TOKEN, env.ANTHROPIC_API_KEY, categories)
    console.log(`[TIMING] resolveCat: ${Date.now() - catStart}ms (source=${cat?.source || 'none'})`)

    const bankWallet = matchWallet(ocr.bank, wallets)
    const wallet = bankWallet || (cat?.walletId ? (wallets.find(w => w.id === cat.walletId) || null) : null)

    const replyStart = Date.now()
    await replyOrPush(event, [buildConfirmFlex(ocr, message.id, today, '', cat, wallet)], env.LINE_CHANNEL_ACCESS_TOKEN)
    console.log(`[TIMING] reply flex: ${Date.now() - replyStart}ms`)
    ms('TOTAL')
  } catch (err) {
    console.error('handleImage error:', err)
    await replyOrPush(event, [{
      type: 'text',
      text: `❌ เกิดข้อผิดพลาด: ${err.message}\nกรุณาลองใหม่อีกครั้งครับ`,
    }], env.LINE_CHANNEL_ACCESS_TOKEN).catch(() => {})
  }
}

async function handlePostback(event, env) {
  const { postback, source } = event
  const userId = source.userId
  let data
  try { data = JSON.parse(postback.data) } catch { return }

  if (data.a === 'edit') {
    return
  }

  if (data.a === 'automemo') {
    const today = new Date().toISOString().slice(0, 10)
    const baseUrl = env.FINTRACK_API_URL || 'https://fintrack-api.iamcreatle.workers.dev'
    const txType = data.ty || 'expense'
    const autoMemo = data.n
      ? `${txType === 'income' ? 'รับจาก' : 'โอนให้'} ${data.n}${data.b ? ` (${data.b})` : ''}`
      : data.r ? `อ้างอิง ${data.r}` : 'ชำระค่าสินค้า/บริการ'
    const editedOcr = {
      is_slip: true, amount: data.amt, date: data.d,
      recipient_name: data.n || null, bank: data.b || null,
      reference: data.r || null, slip_type: data.t || 'transfer',
    }
    const [cat, wallets] = await Promise.all([
      resolveCat(data.n, data.amt, txType, baseUrl, env.FINTRACK_TOKEN, env.ANTHROPIC_API_KEY),
      getWallets(baseUrl, env.FINTRACK_TOKEN),
    ])
    const wallet = data.wi ? (wallets.find(w => w.id === data.wi) || null) : matchWallet(data.b, wallets)
    await replyOrPush(event, [buildConfirmFlex(editedOcr, data.m, today, autoMemo, cat, wallet, txType)], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  if (data.a === 'cancel') {
    await replyOrPush(event, [{ type: 'text', text: '↩️ ยกเลิกแล้วครับ ไม่มีการบันทึก' }], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  if (data.a === 'catmenu') {
    const baseUrl = env.FINTRACK_API_URL || 'https://fintrack-api.iamcreatle.workers.dev'
    const cats = await getCategories(baseUrl, env.FINTRACK_TOKEN)
    const { a: _a, ...txSnap } = data
    await replyOrPush(event, [buildCatSelectFlex(cats, txSnap, 'main')], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  if (data.a === 'catsel') {
    const baseUrl = env.FINTRACK_API_URL || 'https://fintrack-api.iamcreatle.workers.dev'
    const [cats, wallets] = await Promise.all([
      getCategories(baseUrl, env.FINTRACK_TOKEN),
      getWallets(baseUrl, env.FINTRACK_TOKEN),
    ])
    const subs = cats.filter(c => c.parentId === data.c)
    const { a: _a, ...txSnap } = data
    if (subs.length > 0) {
      await replyOrPush(event, [buildCatSelectFlex(cats, txSnap, 'sub', data.c)], env.LINE_CHANNEL_ACCESS_TOKEN)
    } else {
      const today = new Date().toISOString().slice(0, 10)
      const txType = data.ty || 'expense'
      const catObj = cats.find(c => c.id === data.c)
      const selectedCat = catObj ? { categoryId: data.c, subCategoryId: null, categoryName: catObj.name, subCategoryName: null, source: 'manual' } : null
      const wallet = data.wi ? (wallets.find(w => w.id === data.wi) || null) : matchWallet(data.b, wallets)
      const editedOcr = { is_slip: true, amount: data.amt, date: data.d, recipient_name: data.n || null, bank: data.b || null, reference: data.r || null, slip_type: data.t || 'transfer' }
      await replyOrPush(event, [buildConfirmFlex(editedOcr, data.m, today, data.mo || '', selectedCat, wallet, txType)], env.LINE_CHANNEL_ACCESS_TOKEN)
    }
    return
  }

  if (data.a === 'subcatsel') {
    const baseUrl = env.FINTRACK_API_URL || 'https://fintrack-api.iamcreatle.workers.dev'
    const [cats, wallets] = await Promise.all([
      getCategories(baseUrl, env.FINTRACK_TOKEN),
      getWallets(baseUrl, env.FINTRACK_TOKEN),
    ])
    const today = new Date().toISOString().slice(0, 10)
    const txType = data.ty || 'expense'
    const catObj = cats.find(c => c.id === data.c)
    const subObj = data.s ? cats.find(c => c.id === data.s) : null
    const selectedCat = catObj ? { categoryId: data.c, subCategoryId: subObj?.id || null, categoryName: catObj.name, subCategoryName: subObj?.name || null, source: 'manual' } : null
    const wallet = data.wi ? (wallets.find(w => w.id === data.wi) || null) : matchWallet(data.b, wallets)
    const editedOcr = { is_slip: true, amount: data.amt, date: data.d, recipient_name: data.n || null, bank: data.b || null, reference: data.r || null, slip_type: data.t || 'transfer' }
    await replyOrPush(event, [buildConfirmFlex(editedOcr, data.m, today, data.mo || '', selectedCat, wallet, txType)], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  if (data.a === 'walletmenu') {
    const baseUrl = env.FINTRACK_API_URL || 'https://fintrack-api.iamcreatle.workers.dev'
    const wallets = await getWallets(baseUrl, env.FINTRACK_TOKEN)
    const { a: _a, ...txSnap } = data
    await replyOrPush(event, [buildWalletSelectFlex(wallets, txSnap)], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  if (data.a === 'walletsel') {
    const baseUrl = env.FINTRACK_API_URL || 'https://fintrack-api.iamcreatle.workers.dev'
    const [cats, wallets] = await Promise.all([
      getCategories(baseUrl, env.FINTRACK_TOKEN),
      getWallets(baseUrl, env.FINTRACK_TOKEN),
    ])
    const today = new Date().toISOString().slice(0, 10)
    const txType = data.ty || 'expense'
    const catObj = data.c ? cats.find(c => c.id === data.c) : null
    const subObj = data.s ? cats.find(c => c.id === data.s) : null
    const selectedCat = catObj ? { categoryId: data.c, subCategoryId: subObj?.id || null, categoryName: catObj.name, subCategoryName: subObj?.name || null, source: 'manual' } : null
    const wallet = data.wi ? (wallets.find(w => w.id === data.wi) || null) : null
    const editedOcr = { is_slip: true, amount: data.amt, date: data.d, recipient_name: data.n || null, bank: data.b || null, reference: data.r || null, slip_type: data.t || 'transfer' }
    await replyOrPush(event, [buildConfirmFlex(editedOcr, data.m, today, data.mo || '', selectedCat, wallet, txType)], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  if (data.a === 'fliptype') {
    const baseUrl = env.FINTRACK_API_URL || 'https://fintrack-api.iamcreatle.workers.dev'
    const [cats, wallets] = await Promise.all([
      getCategories(baseUrl, env.FINTRACK_TOKEN),
      getWallets(baseUrl, env.FINTRACK_TOKEN),
    ])
    const today = new Date().toISOString().slice(0, 10)
    const txType = data.ty || 'expense'  // already the flipped type
    const catObj = data.c ? cats.find(c => c.id === data.c) : null
    const subObj = data.s ? cats.find(c => c.id === data.s) : null
    const selectedCat = catObj ? { categoryId: data.c, subCategoryId: subObj?.id || null, categoryName: catObj.name, subCategoryName: subObj?.name || null, source: 'manual' } : null
    const wallet = data.wi ? (wallets.find(w => w.id === data.wi) || null) : null
    const editedOcr = { is_slip: true, amount: data.amt, date: data.d, recipient_name: data.n || null, bank: data.b || null, reference: data.r || null, slip_type: data.t || 'transfer' }
    await replyOrPush(event, [buildConfirmFlex(editedOcr, data.m, today, data.mo || '', selectedCat, wallet, txType)], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  if (data.a === 'delconf') {
    await replyOrPush(event, [buildDeleteConfirmFlex(data.id, data.amt, data.n, data.d)], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  if (data.a === 'delok') {
    try {
      const baseUrl = env.FINTRACK_API_URL || 'https://fintrack-api.iamcreatle.workers.dev'
      await fintrack('DELETE', `/transactions/${data.id}`, null, baseUrl, env.FINTRACK_TOKEN)
      await replyOrPush(event, [{ type: 'text', text: '🗑️ ลบรายการเรียบร้อยแล้วครับ' }], env.LINE_CHANNEL_ACCESS_TOKEN)
    } catch (err) {
      await replyOrPush(event, [{ type: 'text', text: `❌ ลบไม่สำเร็จ: ${err.message}` }], env.LINE_CHANNEL_ACCESS_TOKEN)
    }
    return
  }

  if (data.a === 'ok') {
    // Don't send "กำลังบันทึก..." — save the replyToken for the final result (push = paid quota)
    try {
      const baseUrl = env.FINTRACK_API_URL || 'https://fintrack-api.iamcreatle.workers.dev'
      const txType = data.ty || 'expense'
      const txName = data.n
        ? `${txType === 'income' ? 'รับจาก' : 'โอนให้'} ${data.n}`
        : txType === 'income' ? 'รายการรับ' : 'รายการจากสลิป'

      const txNote = data.mo || (data.r ? `อ้างอิง: ${data.r}` : undefined)
      const submittedBy = await lookupEmployee(source.userId, baseUrl, env.FINTRACK_TOKEN)
      const txBody = {
        name: txName, amount: data.amt, type: txType,
        scope: 'business', date: data.d, note: txNote,
        ...(data.c ? { categoryId: data.c } : {}),
        ...(data.s ? { subCategoryId: data.s } : {}),
        ...(data.wi ? { walletId: data.wi } : {}),
        ...(submittedBy ? { submittedBy } : {}),
      }
      const txData = await fintrack('POST', '/transactions', txBody, baseUrl, env.FINTRACK_TOKEN)

      // Guard: never report success when the API didn't actually save (e.g. expired token).
      if (!txData?.transaction?.id) {
        console.error('[confirm] save failed:', JSON.stringify(txData).slice(0, 200))
        await replyOrPush(event, [{
          type: 'text',
          text: `❌ บันทึกไม่สำเร็จครับ: ${txData?.error || 'ระบบไม่ตอบกลับ'}\nรบกวนแจ้งแอดมินตรวจสอบการเชื่อมต่อ (token) ครับ`,
        }], env.LINE_CHANNEL_ACCESS_TOKEN)
        return
      }

      // Remember this recipient → category/wallet so next time the bot auto-fills it
      // (incl. corrections the user just made). Works for transfer slips too.
      if (data.n && (data.c || data.wi)) {
        try {
          await fintrack('POST', '/vendor-profiles', {
            vendorName: data.n,
            categoryId: data.c || null,
            subCategoryId: data.s || null,
            walletId: data.wi || null,
          }, baseUrl, env.FINTRACK_TOKEN)
        } catch (e) {
          console.error('vendor-profile learn error:', e)
        }
      }

      const txId = txData.transaction?.id
      let slipId = null
      let imageBuffer = null
      let slipUploadErr = ''
      if (txId && data.m) {
        try {
          imageBuffer = await downloadImage(data.m, env.LINE_CHANNEL_ACCESS_TOKEN)
        } catch (e) {
          console.error('downloadImage error:', e)
          slipUploadErr = `download: ${e.message}`
        }
        if (imageBuffer) {
          try {
            const slipType = data.t === 'transfer' ? 'transfer' : 'receipt'
            slipId = await uploadSlip(txId, imageBuffer, data.m, slipType, baseUrl, env.FINTRACK_TOKEN)
            if (!slipId) slipUploadErr = 'API ไม่คืน slip.id'
          } catch (e) {
            console.error('uploadSlip error:', e)
            slipUploadErr = e.message
          }
        }
      }

      const typeLabel = txType === 'income' ? 'รายรับ' : 'รายจ่าย'
      const lines = [
        `✅ บันทึก${typeLabel}แล้วครับ`,
        '',
        `💰 ยอด:    ฿${thb(data.amt)}`,
        `💼 ประเภท: ${txType === 'income' ? '💚 รายรับ' : '💸 รายจ่าย'}`,
        data.n && `👤 ${txType === 'income' ? 'จากใคร' : 'ผู้รับ'}:  ${data.n}`,
        data.b && `🏦 ธนาคาร: ${data.b}`,
        `📅 วันที่:  ${data.d}`,
        data.r && `📋 อ้างอิง: ${data.r}`,
        data.mo && `📝 บันทึก:  ${data.mo}`,
        data.m && (slipId ? '📎 แนบสลิปแล้ว' : `⚠️ แนบสลิปไม่สำเร็จ${slipUploadErr ? `: ${slipUploadErr}` : ''}`),
      ].filter(Boolean).join('\n')

      const voucherPayload = encodeURIComponent(JSON.stringify({
        id: txId || '',
        n: data.n || '',
        amt: data.amt,
        d: data.d,
        b: data.b || '',
        r: data.r || '',
        mo: data.mo || '',
        si: slipId || '',
        ty: txType,
      }))
      const fallbackVoucherUrl = `https://fintrack-frontend-d6m.pages.dev/voucher?d=${voucherPayload}`
      const docLabel = txType === 'income' ? 'ใบรับเงิน' : 'ใบสำคัญจ่าย'

      let voucherUrl = fallbackVoucherUrl
      let gdriveNote = ''
      if (env.VOUCHER_BUCKET) {
        try {
          const docPrefix = txType === 'income' ? 'RV' : 'PV'
          const voucherNo = `${docPrefix}-${(data.d || '').replace(/-/g, '')}-${(txId || 'XXXX').slice(-4).toUpperCase()}`
          const slipBase64 = imageBuffer ? toBase64(imageBuffer) : null
          const html = generateVoucherHTML({ ...data, id: txId, ty: txType }, slipBase64)
          const r2Url = await uploadVoucherToR2(env.VOUCHER_BUCKET, voucherNo, data.d, html)
          if (r2Url) voucherUrl = r2Url
          gdriveNote = '\n📁 บันทึกเอกสารสำเร็จ'
        } catch (e) {
          console.error('R2 upload error:', e)
          gdriveNote = `\n⚠️ R2: ${e.message}`
        }
      }

      await replyOrPush(event, [
        { type: 'text', text: lines + gdriveNote },
        {
          type: 'flex',
          altText: `📄 ดู${docLabel}`,
          contents: {
            type: 'bubble',
            size: 'kilo',
            body: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '16px',
              contents: [{
                type: 'text',
                text: `📄 สร้าง${docLabel}สำหรับรายการนี้`,
                size: 'sm',
                color: '#374151',
                wrap: true,
              }],
            },
            footer: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '12px',
              paddingTop: '0px',
              spacing: 'sm',
              contents: [
                {
                  type: 'button',
                  style: 'primary',
                  height: 'sm',
                  color: '#1a7a4a',
                  action: { type: 'uri', label: `📄 เปิด${docLabel}`, uri: voucherUrl },
                },
                txId && {
                  type: 'button',
                  style: 'secondary',
                  height: 'sm',
                  action: { type: 'postback', label: '🗑️ ลบรายการนี้', data: JSON.stringify({ a: 'delconf', id: txId, amt: data.amt, n: data.n || '', d: data.d }) },
                },
              ].filter(Boolean),
            },
          },
        },
      ], env.LINE_CHANNEL_ACCESS_TOKEN)
    } catch (err) {
      console.error('handlePostback error:', err)
      await replyOrPush(event, [{
        type: 'text',
        text: `❌ บันทึกไม่สำเร็จ: ${err.message}\nกรุณาลองใหม่อีกครั้งครับ`,
      }], env.LINE_CHANNEL_ACCESS_TOKEN).catch(() => {})
    }
  }
}

async function handleText(event, env) {
  const { message, source } = event
  const text = message.text.trim()
  const today = new Date().toISOString().slice(0, 10)
  const baseUrl = env.FINTRACK_API_URL || 'https://fintrack-api.iamcreatle.workers.dev'

  // Parse edited slip data: /แก้|m=MSGID|a=AMOUNT|d=DATE|b=BANK|r=REF|t=TYPE|n=NAME[|mo=MEMO]
  if (text.startsWith('/แก้|') || text.startsWith('/บันทึก|')) {
    const prefix = text.startsWith('/แก้|') ? '/แก้|' : '/บันทึก|'
    const params = {}
    text.slice(prefix.length).split('|').forEach(pair => {
      const idx = pair.indexOf('=')
      if (idx > 0) params[pair.slice(0, idx)] = pair.slice(idx + 1)
    })
    const editedOcr = {
      is_slip: true,
      amount: parseFloat(params.a) || 0,
      date: params.d || null,
      recipient_name: params.n || null,
      bank: params.b || null,
      reference: params.r || null,
      slip_type: params.t || 'transfer',
    }
    const cat = await resolveCat(params.n, params.a, 'expense', baseUrl, env.FINTRACK_TOKEN, env.ANTHROPIC_API_KEY)
    await replyOrPush(event, [buildConfirmFlex(editedOcr, params.m, today, params.mo || '', cat)], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  // Registration: "ลงทะเบียน ชื่อของฉัน"
  const regMatch = text.match(/^ลงทะเบียน\s+(.{1,30})$/)
  if (regMatch) {
    const employeeName = regMatch[1].trim()
    try {
      const lineProfile = await fetch(`https://api.line.me/v2/profile/${source.userId}`, {
        headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
      }).then(r => r.ok ? r.json() : null).catch(() => null)
      await registerEmployee(source.userId, employeeName, lineProfile?.displayName || null, baseUrl, env.FINTRACK_TOKEN)
      await replyOrPush(event, [{
        type: 'text',
        text: `✅ ลงทะเบียนสำเร็จครับ\n👤 ชื่อ: ${employeeName}\n\nต่อไปนี้รายการที่คุณส่งจะแสดงชื่อผู้บันทึกด้วยครับ`,
      }], env.LINE_CHANNEL_ACCESS_TOKEN)
    } catch (err) {
      await replyOrPush(event, [{ type: 'text', text: `❌ ลงทะเบียนไม่สำเร็จ: ${err.message}` }], env.LINE_CHANNEL_ACCESS_TOKEN)
    }
    return
  }

  if (['ช่วยเหลือ', 'help', '?', 'menu'].includes(text.toLowerCase())) {
    await replyOrPush(event, [{
      type: 'text',
      text: [
        '📋 คำสั่งที่ใช้ได้',
        '',
        '📸 ส่งรูปสลิป → ตรวจสอบแล้วกดยืนยัน',
        '💬 "จ่าย 500 ค่าน้ำ" → บันทึกรายจ่ายโดยไม่มีสลิป',
        '💬 "รับ 1000 ขายของ" → บันทึกรายรับโดยไม่มีสลิป',
        '💬 "ยอดวันนี้" → ดูยอดรายรับ/จ่ายวันนี้',
        '💬 "ยอดสัปดาห์นี้" → สรุปยอดสัปดาห์นี้',
        '💬 "ยอดเดือนนี้" → สรุปยอดเดือนนี้',
        '💬 "รายการล่าสุด" → 5 รายการล่าสุด',
        '💬 "รายงานเดือนนี้" → ส่งออก CSV รายเดือน',
        '💬 "รายงาน 2026-05" → CSV เดือนที่ระบุ',
        '💬 "ค้นหา ปตท" → ค้นหารายการ',
        '💬 "ตั้งงบ อาหาร 5000" → ตั้งงบต่อหมวดหมู่',
        '💬 "ดูงบ" → ดูงบและยอดใช้จ่าย',
        '💬 "ลบงบ อาหาร" → ลบงบหมวดนั้น',
        '💬 "ลบล่าสุด" → ลบรายการล่าสุด',
        '💬 "ลงทะเบียน ชื่อ" → ลงทะเบียนชื่อพนักงาน',
        '💬 "ช่วยเหลือ" → แสดงคำสั่งทั้งหมด',
      ].join('\n'),
    }], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  if (text === 'ยอดวันนี้') {
    const data = await fintrack('GET', `/transactions?from=${today}&to=${today}&limit=1000`, null, baseUrl, env.FINTRACK_TOKEN)
    const txs = data.transactions || []
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    await replyOrPush(event, [{
      type: 'text',
      text: [
        `📊 ยอดวันนี้ (${today})`,
        '',
        `✅ รายรับ:  ฿${thb(income)}`,
        `❌ รายจ่าย: ฿${thb(expense)}`,
        `💰 สุทธิ:   ฿${thb(income - expense)}`,
        `📝 ${txs.length} รายการ`,
      ].join('\n'),
    }], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  if (text === 'ยอดสัปดาห์นี้') {
    const d = new Date()
    const dow = d.getDay()
    const daysFromMon = dow === 0 ? 6 : dow - 1
    const mon = new Date(d)
    mon.setDate(d.getDate() - daysFromMon)
    const fromDate = mon.toISOString().slice(0, 10)
    const data = await fintrack('GET', `/transactions?from=${fromDate}&to=${today}&limit=1000`, null, baseUrl, env.FINTRACK_TOKEN)
    const txs = data.transactions || []
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    await replyOrPush(event, [{
      type: 'text',
      text: [
        `📊 ยอดสัปดาห์นี้ (${fromDate} – ${today})`,
        '',
        `✅ รายรับ:  ฿${thb(income)}`,
        `❌ รายจ่าย: ฿${thb(expense)}`,
        `💰 สุทธิ:   ฿${thb(income - expense)}`,
        `📝 ${txs.length} รายการ`,
      ].join('\n'),
    }], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  if (text === 'ยอดเดือนนี้') {
    const fromDate = today.slice(0, 7) + '-01'
    const data = await fintrack('GET', `/transactions?from=${fromDate}&to=${today}&limit=1000`, null, baseUrl, env.FINTRACK_TOKEN)
    const txs = data.transactions || []
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    await replyOrPush(event, [{
      type: 'text',
      text: [
        `📊 ยอดเดือนนี้ (${fromDate} – ${today})`,
        '',
        `✅ รายรับ:  ฿${thb(income)}`,
        `❌ รายจ่าย: ฿${thb(expense)}`,
        `💰 สุทธิ:   ฿${thb(income - expense)}`,
        `📝 ${txs.length} รายการ`,
      ].join('\n'),
    }], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  if (text === 'รายการล่าสุด') {
    const data = await fintrack('GET', '/transactions?limit=5', null, baseUrl, env.FINTRACK_TOKEN)
    const txs = data.transactions || []
    const list = txs.length
      ? txs.map((t, i) => `${i + 1}. ${t.name}\n   ${t.type === 'income' ? '+' : '-'}฿${thb(t.amount)} · ${t.date}`).join('\n\n')
      : 'ยังไม่มีรายการ'
    await replyOrPush(event, [{
      type: 'text',
      text: `📋 5 รายการล่าสุด\n\n${list}`,
    }], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  // ตั้งงบ: "ตั้งงบ อาหาร 5000"
  const budgetSetMatch = text.match(/^ตั้งงบ\s+(.+?)\s+([\d,]+(?:\.\d+)?)$/)
  if (budgetSetMatch) {
    const [, catName, amtStr] = budgetSetMatch
    const budgetAmt = parseFloat(amtStr.replace(/,/g, ''))
    const cats = await getCategories(baseUrl, env.FINTRACK_TOKEN)
    const cat = cats.find(c => !c.parentId && c.name.toLowerCase().includes(catName.toLowerCase()))
    if (!cat) {
      await replyOrPush(event, [{ type: 'text', text: `❌ ไม่พบหมวดหมู่ "${catName}" ครับ\nพิมพ์ "ดูงบ" เพื่อดูหมวดที่มี` }], env.LINE_CHANNEL_ACCESS_TOKEN)
      return
    }
    const budget = await getBudget(env.VOUCHER_BUCKET)
    budget[cat.id] = { name: cat.name, budget: budgetAmt }
    await saveBudget(env.VOUCHER_BUCKET, budget)
    await replyOrPush(event, [{ type: 'text', text: `✅ ตั้งงบ "${cat.name}" = ฿${thb(budgetAmt)}/เดือน เรียบร้อยแล้วครับ` }], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  // ลบงบ: "ลบงบ อาหาร"
  const budgetDelMatch = text.match(/^ลบงบ\s+(.+)$/)
  if (budgetDelMatch) {
    const catName = budgetDelMatch[1].trim()
    const budget = await getBudget(env.VOUCHER_BUCKET)
    const entry = Object.entries(budget).find(([, v]) => v.name.toLowerCase().includes(catName.toLowerCase()))
    if (!entry) {
      await replyOrPush(event, [{ type: 'text', text: `❌ ไม่พบงบสำหรับ "${catName}" ครับ` }], env.LINE_CHANNEL_ACCESS_TOKEN)
      return
    }
    delete budget[entry[0]]
    await saveBudget(env.VOUCHER_BUCKET, budget)
    await replyOrPush(event, [{ type: 'text', text: `🗑️ ลบงบ "${entry[1].name}" เรียบร้อยแล้วครับ` }], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  // ดูงบ
  if (text === 'ดูงบ') {
    const budget = await getBudget(env.VOUCHER_BUCKET)
    const entries = Object.entries(budget)
    if (!entries.length) {
      await replyOrPush(event, [{
        type: 'text',
        text: 'ยังไม่ได้ตั้งงบครับ\nพิมพ์ "ตั้งงบ อาหาร 5000" เพื่อตั้งงบต่อหมวดหมู่',
      }], env.LINE_CHANNEL_ACCESS_TOKEN)
      return
    }
    const fromDate = today.slice(0, 7) + '-01'
    const res = await fintrack('GET', `/transactions?from=${fromDate}&to=${today}&limit=1000`, null, baseUrl, env.FINTRACK_TOKEN)
    const txs = (res.transactions || []).filter(t => t.type === 'expense')
    const spentByCat = {}
    for (const t of txs) {
      if (t.categoryId) spentByCat[t.categoryId] = (spentByCat[t.categoryId] || 0) + t.amount
    }
    const lines = [`💰 งบประมาณเดือน ${today.slice(0, 7)}`, '']
    for (const [catId, { name, budget: budgetAmt }] of entries) {
      const spent = spentByCat[catId] || 0
      const pct = Math.min(100, Math.round((spent / budgetAmt) * 100))
      const filled = Math.round(pct / 10)
      const bar = '▓'.repeat(filled) + '░'.repeat(10 - filled)
      const warn = pct >= 90 ? ' 🚨' : pct >= 70 ? ' ⚠️' : ''
      lines.push(`${name}${warn}`)
      lines.push(`  ฿${thb(spent)} / ฿${thb(budgetAmt)} (${pct}%)`)
      lines.push(`  ${bar}`)
      lines.push('')
    }
    await replyOrPush(event, [{ type: 'text', text: lines.join('\n').trim() }], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  // รายงาน CSV: "รายงานเดือนนี้" หรือ "รายงาน 2026-05"
  const reportMatch = text.match(/^รายงาน(?:เดือนนี้|(\d{4}-\d{2}))?$/)
  if (reportMatch !== null || text === 'รายงานเดือนนี้') {
    const month = reportMatch?.[1] || today.slice(0, 7)
    const fromDate = `${month}-01`
    const toDate = month === today.slice(0, 7) ? today : `${month}-31`
    // Don't reply "กำลังสร้างรายงาน..." — save the replyToken for the actual result (push = paid quota)
    try {
      const res = await fintrack('GET', `/transactions?from=${fromDate}&to=${toDate}&limit=1000`, null, baseUrl, env.FINTRACK_TOKEN)
      const txs = res.transactions || []
      if (!txs.length) {
        await replyOrPush(event, [{ type: 'text', text: `ไม่มีรายการในเดือน ${month} ครับ` }], env.LINE_CHANNEL_ACCESS_TOKEN)
        return
      }
      // Build CSV with BOM for Excel Thai encoding
      const rows = ['﻿วันที่,ประเภท,ชื่อรายการ,ยอด,หมวดหมู่,หมวดย่อย,กระเป๋า,อ้างอิง,บันทึก']
      for (const t of txs) {
        const esc = v => `"${(v || '').toString().replace(/"/g, '""')}"`
        rows.push([
          t.date, t.type === 'income' ? 'รายรับ' : 'รายจ่าย',
          esc(t.name), t.amount,
          esc(t.categoryName), esc(t.subCategoryName),
          esc(t.walletName), esc(t.reference), esc(t.note),
        ].join(','))
      }
      const csv = rows.join('\r\n')
      const key = `reports/${month}/report-${Date.now()}.csv`
      await env.VOUCHER_BUCKET.put(key, csv, { httpMetadata: { contentType: 'text/csv; charset=utf-8' } })
      const url = `${R2_PUBLIC_URL}/${key}`
      const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
      const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
      await replyOrPush(event, [{
        type: 'text',
        text: [
          `📊 รายงานเดือน ${month}`,
          `📝 ${txs.length} รายการ`,
          `✅ รายรับ:  ฿${thb(income)}`,
          `❌ รายจ่าย: ฿${thb(expense)}`,
          `💰 สุทธิ:   ฿${thb(income - expense)}`,
          '',
          `📥 ดาวน์โหลด CSV:\n${url}`,
          '',
          '💡 เปิดด้วย Excel หรือ Google Sheets ได้เลยครับ',
        ].join('\n'),
      }], env.LINE_CHANNEL_ACCESS_TOKEN)
    } catch (err) {
      await replyOrPush(event, [{ type: 'text', text: `❌ สร้างรายงานไม่สำเร็จ: ${err.message}` }], env.LINE_CHANNEL_ACCESS_TOKEN).catch(() => {})
    }
    return
  }

  // ค้นหารายการ: "ค้นหา ปตท" หรือ "หา ปตท"
  const searchMatch = text.match(/^(?:ค้นหา|หา)\s+(.+)$/)
  if (searchMatch) {
    const keyword = searchMatch[1].trim()
    const q = new URLSearchParams({ search: keyword, limit: '10' })
    const res = await fintrack('GET', `/transactions?${q}`, null, baseUrl, env.FINTRACK_TOKEN)
    const txs = res.transactions || []
    if (!txs.length) {
      await replyOrPush(event, [{ type: 'text', text: `🔍 ไม่พบรายการที่มีคำว่า "${keyword}" ครับ` }], env.LINE_CHANNEL_ACCESS_TOKEN)
      return
    }
    const list = txs.map((t, i) =>
      `${i + 1}. ${t.name}\n   ${t.type === 'income' ? '+' : '-'}฿${thb(t.amount)} · ${t.date}`
    ).join('\n\n')
    await replyOrPush(event, [{
      type: 'text',
      text: `🔍 ผลค้นหา "${keyword}" (${txs.length} รายการ)\n\n${list}`,
    }], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  if (text === 'ลบล่าสุด') {
    const res = await fintrack('GET', '/transactions?limit=1', null, baseUrl, env.FINTRACK_TOKEN)
    const tx = (res.transactions || [])[0]
    if (!tx) {
      await replyOrPush(event, [{ type: 'text', text: 'ยังไม่มีรายการครับ' }], env.LINE_CHANNEL_ACCESS_TOKEN)
      return
    }
    await replyOrPush(event, [buildDeleteConfirmFlex(tx.id, tx.amount, tx.name, tx.date)], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  if (text === 'myid') {
    await replyOrPush(event, [{ type: 'text', text: `LINE User ID ของคุณ:\n${source.userId}` }], env.LINE_CHANNEL_ACCESS_TOKEN)
    return
  }

  // Quick text entry: "จ่าย 500 ค่าน้ำ" / "รับ 1000 ขายของ" / "500 ค่าข้าว"
  const quickMatch = !text.startsWith('/') && text.match(/^(จ่าย|ออก|รับ|รายรับ)?\s*([\d,]+(?:\.\d+)?)\s*(.{0,50})$/)
  if (quickMatch) {
    const [, typeWord, amountStr, desc] = quickMatch
    const amount = parseFloat(amountStr.replace(/,/g, ''))
    if (amount > 0) {
      const txType = (typeWord === 'รับ' || typeWord === 'รายรับ') ? 'income' : 'expense'
      const name = desc.trim() || null
      const fakeOcr = { is_slip: true, amount, date: today, recipient_name: name, bank: null, reference: null, slip_type: 'receipt' }
      const [cat, wallets] = await Promise.all([
        resolveCat(name, amount, txType, baseUrl, env.FINTRACK_TOKEN, env.ANTHROPIC_API_KEY),
        getWallets(baseUrl, env.FINTRACK_TOKEN),
      ])
      const wallet = cat?.walletId ? (wallets.find(w => w.id === cat.walletId) || null) : null
      await replyOrPush(event, [buildConfirmFlex(fakeOcr, null, today, '', cat, wallet, txType)], env.LINE_CHANNEL_ACCESS_TOKEN)
      return
    }
  }

  await replyOrPush(event, [{
    type: 'text',
    text: '📸 ส่งรูปสลิปมาได้เลยครับ\nหรือพิมพ์ "ช่วยเหลือ" เพื่อดูคำสั่งทั้งหมด',
  }], env.LINE_CHANNEL_ACCESS_TOKEN)
}

// ── Main ───────────────────────────────────────────────────

export async function onRequestPost(context) {
  const { request, env } = context

  const rawBody = await request.arrayBuffer()
  const signature = request.headers.get('x-line-signature')

  if (!signature || !(await verifySignature(rawBody, signature, env.LINE_CHANNEL_SECRET))) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 })
  }

  const body = JSON.parse(new TextDecoder().decode(rawBody))

  const response = new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

  context.waitUntil(
    (async () => {
      for (const event of body.events || []) {
        try {
          if (event.type === 'message') {
            if (event.message.type === 'image') await handleImage(event, env)
            else if (event.message.type === 'text') await handleText(event, env)
          } else if (event.type === 'postback') {
            await handlePostback(event, env)
          }
        } catch (err) {
          console.error('Event error:', err)
        }
      }
    })()
  )

  return response
}
