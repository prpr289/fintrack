// GET /api/daily-report?secret=CRON_SECRET
// Call this from an external cron service at 23:59 Thai time (16:59 UTC)
// Required env vars: CRON_SECRET, LINE_USER_ID, LINE_CHANNEL_ACCESS_TOKEN,
//                    FINTRACK_API_URL, FINTRACK_TOKEN, VOUCHER_BUCKET

function thb(n) {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

async function getBudget(bucket) {
  if (!bucket) return {}
  try {
    const obj = await bucket.get('settings/budget.json')
    if (!obj) return {}
    return JSON.parse(await obj.text())
  } catch { return {} }
}

async function push(userId, text, token) {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: userId, messages: [{ type: 'text', text }] }),
  })
}

export async function onRequestGet(context) {
  const { request, env } = context
  const url = new URL(request.url)

  const secret = url.searchParams.get('secret')
  if (!secret || secret.trim() !== (env.CRON_SECRET || '').trim()) {
    return new Response('Unauthorized', { status: 401 })
  }

  const userId = env.LINE_USER_ID
  if (!userId) {
    return new Response('LINE_USER_ID not configured', { status: 500 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const baseUrl = env.FINTRACK_API_URL || 'https://fintrack-api.iamcreatle.workers.dev'

  try {
    // ── ดึง transactions วันนี้ ──
    const res = await fetch(`${baseUrl}/transactions?from=${today}&to=${today}&limit=1000`, {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.FINTRACK_TOKEN}` },
    })
    const data = await res.json()
    const txs = data.transactions || []
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const net = income - expense

    const summaryText = [
      `📊 สรุปยอดประจำวัน (${today})`,
      '',
      `✅ รายรับ:  ฿${thb(income)}`,
      `❌ รายจ่าย: ฿${thb(expense)}`,
      `${net >= 0 ? '💰' : '⚠️'} สุทธิ:   ฿${thb(net)}`,
      `📝 ${txs.length} รายการ`,
    ].join('\n')

    await push(userId, summaryText, env.LINE_CHANNEL_ACCESS_TOKEN)

    // ── ตรวจสอบงบประมาณ ──
    const budget = await getBudget(env.VOUCHER_BUCKET)
    const budgetEntries = Object.entries(budget)
    if (budgetEntries.length > 0) {
      const fromDate = today.slice(0, 7) + '-01'
      const mRes = await fetch(`${baseUrl}/transactions?from=${fromDate}&to=${today}&limit=1000`, {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.FINTRACK_TOKEN}` },
      })
      const mData = await mRes.json()
      const monthTxs = (mData.transactions || []).filter(t => t.type === 'expense')
      const spentByCat = {}
      for (const t of monthTxs) {
        if (t.categoryId) spentByCat[t.categoryId] = (spentByCat[t.categoryId] || 0) + t.amount
      }

      const warnings = []
      for (const [catId, { name, budget: budgetAmt }] of budgetEntries) {
        const spent = spentByCat[catId] || 0
        const pct = Math.round((spent / budgetAmt) * 100)
        if (pct >= 80) {
          const icon = pct >= 100 ? '🚨' : '⚠️'
          warnings.push(`${icon} ${name}: ฿${thb(spent)} / ฿${thb(budgetAmt)} (${pct}%)`)
        }
      }

      if (warnings.length > 0) {
        const warnText = [
          '⚠️ แจ้งเตือนงบประมาณเดือนนี้',
          '',
          ...warnings,
          '',
          'พิมพ์ "ดูงบ" เพื่อดูรายละเอียดทั้งหมดครับ',
        ].join('\n')
        await push(userId, warnText, env.LINE_CHANNEL_ACCESS_TOKEN)
      }
    }

    return new Response(JSON.stringify({ ok: true, txs: txs.length, income, expense }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
