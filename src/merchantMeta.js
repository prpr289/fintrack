// ตารางค่าคงที่ของข้อมูลร้านค้า — ใช้ร่วมกันทุกจอ (ลิสต์ · โปรไฟล์ · ฟอร์ม · picker)
// ค่า key ต้องตรงกับที่ worker ยอมรับใน buildVendorFields

// เอกสารที่ร้านออกให้ได้ = ตัวชี้ว่าซื้อจากร้านนี้แล้วลงรายจ่ายทางภาษีได้แค่ไหน
export const DOC_TYPES = [
  { value: 'full_tax',  label: 'ใบกำกับภาษีเต็มรูป', short: 'ใบกำกับเต็มรูป', color: '#34d399',
    effect: 'ลงรายจ่ายได้ + ขอคืน VAT ได้' },
  { value: 'short_tax', label: 'ใบกำกับอย่างย่อ',     short: 'ใบกำกับย่อ',     color: '#38bdf8',
    effect: 'ลงรายจ่ายได้ · ขอคืน VAT ไม่ได้' },
  { value: 'receipt',   label: 'บิลเงินสด / ใบเสร็จ', short: 'บิลเงินสด',      color: '#f59e0b',
    effect: 'ลงรายจ่ายได้ถ้าข้อมูลผู้ขายครบ · VAT ไม่ได้' },
  { value: 'none',      label: 'ไม่มีเอกสาร',          short: 'ไม่มีเอกสาร',    color: '#f43f5e',
    effect: 'ต้องทำใบสำคัญรับเงินให้ผู้ขายเซ็นทุกครั้ง' },
]

export const TAXPAYER_TYPES = [
  { value: 'juristic',   label: 'นิติบุคคล' },
  { value: 'individual', label: 'บุคคลธรรมดา' },
]

// อัตราตาม ป.3/ป.53 ที่ใช้บ่อยในร้านอาหาร — worker เป็นคนคำนวณ rate จาก type
export const WHT_TYPES = [
  { value: 'none',      label: 'ไม่ต้องหัก (ซื้อสินค้า)', rate: 0 },
  { value: 'transport', label: 'ค่าขนส่ง',                 rate: 1 },
  { value: 'ads',       label: 'ค่าโฆษณา',                 rate: 2 },
  { value: 'service',   label: 'ค่าบริการ / จ้างทำของ',     rate: 3 },
  { value: 'rent',      label: 'ค่าเช่า',                   rate: 5 },
]

export const docTypeMeta = (v) => DOC_TYPES.find(d => d.value === v) || null
export const whtTypeMeta = (v) => WHT_TYPES.find(w => w.value === v) || null
export const taxpayerLabel = (v) => TAXPAYER_TYPES.find(t => t.value === v)?.label || null
