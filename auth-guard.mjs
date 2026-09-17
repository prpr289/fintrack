// ด่านร่วมของ worker ที่ไม่ต้องแตะ D1 — แยกไฟล์ให้มีเทสรันได้ (แบบเดียวกับ hros-sync.mjs)
// Run tests: node auth-guard.test.mjs

// เทียบ service token แบบไม่รั่วเวลา
// `a === b` หยุดทันทีที่เจอตัวอักษรแรกที่ไม่ตรง ยิงวัดเวลาซ้ำ ๆ จะเดา token ได้ทีละตัว
// จึง hash ทั้งสองฝั่งเป็น SHA-256 ก่อน (ความยาวเท่ากันเสมอ ความยาว token จริงไม่รั่ว)
// แล้ว XOR ครบทั้ง 32 ไบต์โดยไม่หยุดกลางทาง
// ผลลัพธ์ต้องเท่ากับ `given === expected` ทุกกรณี — path ของ LINE bot พึ่งค่านี้ (INTEGRATION_POLICY ข้อ 3)
export async function safeTokenEqual(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string' || !given || !expected) return false
  const enc = new TextEncoder()
  const [ga, gb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ])
  const x = new Uint8Array(ga)
  const y = new Uint8Array(gb)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

// ALLOWED_ORIGINS = รายชื่อ origin คั่นด้วย comma เช่น "https://fintrack-frontend-d6m.pages.dev,http://localhost:5173"
// ไม่ตั้ง / ว่าง / มีแต่ comma = null = ใช้พฤติกรรมเดิม (Access-Control-Allow-Origin: *)
export function parseAllowedOrigins(raw) {
  const list = String(raw || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  return list.length ? list : null
}

// ครอบ response ขาออกทุกตัวของ fetch handler ครั้งเดียว แทนการแก้ cors() ที่ถูกเรียกหลายร้อยจุด
// - ALLOWED_ORIGINS ไม่ได้ตั้ง: คืน response ตัวเดิมเป๊ะ (ไม่สร้างใหม่ด้วยซ้ำ) → deploy โดยไม่ตั้งค่า = ไม่มีอะไรเปลี่ยน
// - ตั้งแล้ว: Origin ที่อยู่ในรายชื่อได้ header กลับไป ที่ไม่อยู่ในรายชื่อไม่ได้ (browser จะไม่ยอมให้อ่าน)
// CORS ไม่ใช่ด่านตัวตน — LINE bot / HR OS เรียกจากเซิร์ฟเวอร์ ไม่มี Origin จึงไม่กระทบ
// response 101 (WebSocket) ต้องส่งต่อตัวเดิม สร้าง Response ใหม่จะทำ socket หลุด
export function applyCorsPolicy(response, request, env) {
  const allowed = parseAllowedOrigins(env && env.ALLOWED_ORIGINS)
  if (!allowed) return response
  if (response.status === 101 || response.webSocket) return response
  const origin = request.headers.get('Origin')
  const h = new Headers(response.headers)
  h.delete('Access-Control-Allow-Origin')
  if (origin && allowed.includes(origin)) h.set('Access-Control-Allow-Origin', origin)
  h.append('Vary', 'Origin')
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: h })
}
