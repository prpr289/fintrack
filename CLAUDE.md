# Famous Star Food OS — Fintrack

## เชื่อมระบบเข้าหากัน (System Integration) — สำคัญ
ก่อน **เชื่อมระบบใด ๆ เข้าหากัน** (Fintrack ↔ HR OS และทุกระบบใหม่ในอนาคต — ทุกระบบใน Famous Star Food OS จะต้องเชื่อมกัน) → **อ่านและทำตาม [`INTEGRATION_POLICY.md`](INTEGRATION_POLICY.md) เสมอ**

สรุปสั้น (รายละเอียดเต็มอยู่ในไฟล์ policy):
1. **1 ระบบ = 1 token** — ห้ามใช้ token ร่วมกันเด็ดขาด
2. แก้โค้ดที่ใช้ร่วม (shared) แบบ **additive เท่านั้น** — ห้ามแก้/ลบ path เดิม
3. **ห้ามแตะ** config/secret/code ที่ระบบเดิมพึ่งพา (เฉพาะรีโปนี้: `SERVICE_TOKEN`, `SERVICE_USER_ID` ของ worker · `FINTRACK_TOKEN` ของ Pages · `functions/*` = LINE bot)
4. **rollback = ลบ secret/ค่าใหม่ทิ้ง** แล้วจบ (ไม่ต้องแก้ของเดิมกลับ)
5. **ก่อนลงมือ**: ทำ checklist ว่าจะแตะอะไรบ้าง + แผน rollback → **รอเจ้าของเคาะ** · **เสร็จแล้วพิสูจน์ว่าระบบเดิมทุกตัวยังทำงาน** (โดยเฉพาะ LINE bot/LIFF)

> ⚠️ `worker.js` เป็น **hand-maintained** — ก่อน `wrangler deploy` เทียบโค้ด prod ปัจจุบันก่อน กัน deploy repo เก่าทับ · Pages secret มีผลตอน **redeploy** เท่านั้น
