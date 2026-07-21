# Integration Policy — Famous Star Food OS

> กติกาสำหรับ **เชื่อมระบบใด ๆ เข้าหากัน** (Fintrack ↔ HR OS, และทุกระบบใหม่ในอนาคต)
> เป้าหมาย: เชื่อมระบบใหม่ได้ โดย **ของเดิมพังไม่ได้**
>
> ที่มา: incident 2026-07-20/21 — ตอน arm Fintrack sync ทำ LINE bot/LIFF ล่มยาว เพราะ HR OS กับ LINE bot ใช้ token ร่วมกัน + แก้ prod โดยไม่โชว์ว่ากระทบอะไรก่อน
> _(รีโปนี้มี copy เดียวกับรีโป HR OS — แก้ที่ไหน sync อีกฝั่งด้วย)_

---

## หลักการเดียว
**แยกกุญแจ · เพิ่มไม่แก้ · ไม่แตะของเดิม**
เปรียบเหมือนกุญแจบ้าน — แต่ละคน (แต่ละระบบ) มีกุญแจดอกของตัวเอง ไม่ใช่ก๊อปดอกเดียวแจกทุกคน

## 5 กติกาบังคับ (ห้ามข้าม)

1. **แยก token ต่อระบบ — ห้ามใช้ token ร่วมกันเด็ดขาด** (1 ระบบ = 1 กุญแจ)
   - แยก 2 ชั้น: **token = แยกเสมอ (บังคับ)** · user/workspace ปลายทาง = รวมหรือแยกเลือกได้ตามต้องการ
2. **แก้โค้ดที่ใช้ร่วม (shared) แบบ "เพิ่มเท่านั้น" (additive)** — เพิ่ม path/if-block ใหม่ (INERT จนตั้ง secret) ห้ามแก้/ลบ path เดิม
3. **ห้ามแตะ config / secret / code ที่ระบบเดิมพึ่งพา**
4. **rollback = ลบ secret/ค่าใหม่ทิ้ง แล้วจบ** — ห้ามออกแบบให้ต้องแก้ของเดิมกลับ
5. **ก่อน deploy อะไรที่ shared → เทียบโค้ด prod ปัจจุบันก่อน** (กัน deploy repo เก่าทับของใหม่กว่า — บาง service hand-maintained)

## กระบวนการ (บังคับกับ AI/คนทำทุกครั้ง)

**ก่อนลงมือ:**
- ทำ **checklist**: จะแตะ ไฟล์ / secret / service อะไรบ้าง + **แผน rollback** → **รอเจ้าของเคาะก่อน**
- ทำทีละขั้น หยุดให้ดูทุกจุดที่กระทบของเดิม

**เสร็จแล้ว (Definition of Done):**
- ✅ ระบบใหม่ทำงาน
- ✅ **ระบบเดิมทุกตัว verify แล้วว่าไม่กระทบ** (ไม่ใช่แค่ระบบใหม่)
- ✅ rollback = ลบของใหม่แล้วจบ (พิสูจน์แล้ว)

## กันหายนะซ้ำ
- **ทำทีละ session** — หลาย session/terminal สั่งพร้อมกัน = คำสั่งชนกัน
- **Pages secret มีผลตอน redeploy เท่านั้น** — ตั้งค่าเฉย ๆ ไม่พอ ต้อง redeploy ทุกครั้งที่เปลี่ยน token ฝั่ง Pages
- **token ห้ามหลุด** — อย่าพิมพ์ค่า token/secret ลงแชท/จอที่แชร์; หลุดแล้วต้อง rotate

## Reference — Fintrack (worker) auth ปัจจุบัน
- LINE bot = Cloudflare Pages Function (`functions/api/line-webhook.js`) → เรียก worker ด้วย env `FINTRACK_TOKEN` (ฝั่ง Pages)
- worker (`fintrack-api`) `requireAuth`: `token === SERVICE_TOKEN` → resolve `SERVICE_USER_ID` → workspace
- **ต้องตรงกัน**: `FINTRACK_TOKEN` (Pages) === `SERVICE_TOKEN` (worker)
- HR OS ควรมี path แยก: `HROS_SERVICE_TOKEN` + `HROS_SERVICE_USER_ID` (additive, ไม่แตะของ LINE)
- **4 จุดห้ามแตะ (LINE พึ่งพา):** `SERVICE_TOKEN` · `SERVICE_USER_ID` (worker) · `FINTRACK_TOKEN` (Pages) · `functions/*` (Pages code)

## Scale — เมื่อระบบเยอะขึ้น (5-10 ระบบ)
เปลี่ยนจาก `if`-block ต่อระบบ → **ตาราง token กลาง 1 ตาราง** (แถวละ: `token` → ชี้ระบบ/สิทธิ์ไหน → ป้ายชื่อระบบ). เพิ่ม/เพิกถอน/ดูว่าใครต่ออยู่ ทำจากที่เดียว ไม่ต้องแก้โค้ดต่อระบบ

---
_ดูไดอะแกรม before/after แบบ visual ได้ที่ artifact "Fintrack ↔ HR OS Integration Framework"_
