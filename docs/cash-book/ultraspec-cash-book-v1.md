# ULTRASPEC — รายงานเงินสดรับ-จ่าย (ประกาศฯ 161) v1

**Status:** FROZEN
**Spec revision:** 1
**Owner approval:** 2026-09-15 — “เริ่ม Phase 1 เลย” (ต่อจากแผนใน artifact `https://claude.ai/artifact/FGFjPRdgYfjHNU9d7cELto`)
**Size / risk:** M / medium — frontend-only, ไม่มี migration, ไม่แตะ Worker; ความเสี่ยงหลักคือ **ตัวเลขผิดแล้วยื่นภาษีผิด**

## 1. Goal and outcome

- **Problem:** เจ้าของต้องส่งรายงานรายรับ-รายจ่ายประจำปีให้ผู้ทำบัญชี และต้องถูกแบบกรมสรรพากร วันนี้ทำได้แค่ export รายกระเป๋าทีละใบ เป็นรูปแบบของ FinTrack เอง แล้วรวมมือใน Excel
- **Observable outcome:** หน้าเดียวที่เลือกช่วงปีภาษี + ติ๊กกระเป๋าที่จะรวม แล้วได้ไฟล์ PDF ตามแบบแนบท้ายประกาศอธิบดีกรมสรรพากร เกี่ยวกับภาษีเงินได้ (ฉบับที่ 161), Excel และ CSV จากข้อมูลชุดเดียวกัน
- **Success metric:** ยอดรวมรายรับ/รายจ่ายของกระเป๋าที่ติ๊ก ตรงกับหน้า “รายงานแยกกระเป๋า” ในช่วงเดียวกันทุกบาท

## 2. Non-goals

- ยื่นภาษีตรงผ่าน API ของกรมสรรพากร
- รายงานภาษีซื้อ–ภาษีขาย / ภาษีมูลค่าเพิ่ม (ต้องเก็บเลขที่ใบกำกับภาษีก่อน ซึ่งยังไม่มีที่เก็บ)
- คำนวณภาษีที่ต้องชำระ หรือให้คำแนะนำทางภาษี
- ZIP รวมสลิปหลักฐาน (Phase 2)
- เก็บค่ากระเป๋าที่เลือกไว้ที่ฐานข้อมูล (Phase 3 ถ้าจำเป็น)

## 3. Scope and boundaries

- **In scope:** หน้าใหม่ `/cash-book` (admin only), โมดูลคำนวณล้วน, ตัวเขียนไฟล์ PDF/XLS/CSV, เมนู
- **Out of scope:** Worker API, D1 schema, LINE bot (`functions/*`, `api/*`), การ deploy
- **Assumptions accepted:** A1–A6 (§16)
- **Dependencies:** `jspdf`, `jspdf-autotable`, ฟอนต์ Sarabun — ติดตั้ง/มีอยู่แล้วทั้งหมด ไม่เพิ่ม dependency ใหม่

## 4. Change Manifest

| Path | Mode | Purpose | Risk |
|---|---|---|---|
| `docs/cash-book/ultraspec-cash-book-v1.md` | NEW | spec + evidence | none |
| `src/cashBook.js` | NEW | logic ล้วน: กรอง/แยกช่อง/รวมยอด/คำเตือน | med — เป็นที่มาของตัวเลขทุกตัว |
| `src/cashBook.test.mjs` | NEW | contract tests | none |
| `src/cashBookExport.js` | NEW | เขียนไฟล์ PDF / XLS / CSV | low |
| `src/pages/CashBook.jsx` | NEW | หน้าจอ | low |
| `src/walletExport.js` | EDIT | เพิ่มคำว่า `export` หน้า `loadFontData` และ `addSarabunFonts` เท่านั้น — ไม่แตะ logic เดิม | low |
| `src/App.jsx` | EDIT | import + route เดียว | low |
| `src/Layout.jsx` | EDIT | nav item เดียวในกลุ่ม “รายงาน” | low |

**Forbidden paths/actions:**
`worker.js` · `fintrack-worker-deployed.js` · `migrations/**` · `functions/**` · `api/**` · `wrangler.toml` · `package.json` (ห้ามเพิ่ม dependency) · `src/walletExport*.js`, `src/walletExcel.js`, `src/csvUtils.js` (ห้ามเปลี่ยนพฤติกรรมเดิม) · ห้าม commit/push/deploy โดยไม่ได้รับอนุญาตแยก

## 5. Current-state evidence

- CLAUDE.md: ต้องอ่าน `INTEGRATION_POLICY.md` ก่อน**เชื่อมระบบ** — งานนี้ไม่เชื่อมระบบใหม่ ไม่แตะ token/secret/worker จึงไม่เข้าเงื่อนไข แต่ยังยึดกฎ “ห้ามแตะ config/secret/code ที่ระบบเดิมพึ่งพา”
- Working tree สะอาด, branch `claude/think360-annual-report-export-2c8955`, HEAD `223e10b`
- ของที่ใช้ซ้ำได้: `collectPaginatedItems` (`src/pagination.js`), `isPostedWalletActivity` (`src/walletDetail.js`), `sqlTime`/`ymd` (`src/fmt.js`), ตัวโหลดฟอนต์ใน `src/walletExport.js`
- `transactions` ไม่มีคอลัมน์ผูกร้านค้า และ `categories` ไม่มีช่องบอกว่าเป็นต้นทุนสินค้า

### Baseline

| ID | Command | Scope | Before | Criticality |
|---|---|---|---|---|
| B-01 | `node --test` | repo root | 46 pass / 0 fail | Critical |
| B-02 | `npm run lint` | repo root | 51 errors / 2 warnings (pre-existing — รายไฟล์อยู่ในตาราง Evidence ท้ายไฟล์) | High |
| B-03 | `npm run build` | repo root | exit 0 | Critical |

B-02 แดงอยู่ก่อนเริ่ม — เกณฑ์คือ **ห้ามเพิ่ม error/warning ใหม่ และห้ามมี error ในไฟล์ที่แตะ**

## 6. Interfaces and data contracts

| ID | Producer | Consumer | Contract | Compatibility |
|---|---|---|---|---|
| I-01 | `GET /transactions?from&to&limit&offset` | `CashBook.jsx` | ของเดิม ไม่เปลี่ยน | อ่านอย่างเดียว |
| I-02 | `GET /wallets`, `GET /categories`, `GET /workspace`, `GET /me` | `CashBook.jsx` | ของเดิม ไม่เปลี่ยน | อ่านอย่างเดียว |
| I-03 | `loadFontData()`, `addSarabunFonts()` | `cashBookExport.js` | เปลี่ยนจาก private → exported, signature เดิม | additive |
| I-04 | `localStorage.ft_cashbook_v1` | `CashBook.jsx` | `{walletIds:[], goodsCategoryIds:[], operatorName:""}` | ใหม่ · อ่านไม่ได้ = ใช้ค่า default |

ไม่มี secret/PII ใหม่ · ไม่ส่งข้อมูลออกนอกเบราว์เซอร์ · ไฟล์ทั้งหมดสร้างและดาวน์โหลดฝั่ง client

## 7. Required behavior

1. หน้า `/cash-book` เปิดได้เฉพาะ role `admin` (ผ่าน `RequireAdmin` เดิม)
2. เลือกช่วงได้: **ทั้งปี** (1 ม.ค.–31 ธ.ค.) และ **ครึ่งปีแรก** (1 ม.ค.–30 มิ.ย.) ของปี พ.ศ. ที่เลือก
3. แสดงกระเป๋าทั้งหมดให้ติ๊ก ค่าตั้งต้น = กระเป๋าที่ `scope === 'business'` · กระเป๋าที่ปิดใช้งานแล้วแต่มีรายการในช่วงนั้น ต้องขึ้นในรายการด้วย พร้อมป้าย “ปิดใช้งานแล้ว”
4. รายการที่เข้ารายงาน = `isPostedWalletActivity` (ตัดรายการโอนภายในและฉบับร่าง) **และ** `type ∈ {income, expense}` **และ** `walletId` อยู่ในกระเป๋าที่ติ๊ก
5. เรียงตามวันที่จากน้อยไปมาก, วันเดียวกันเรียงตามเวลาที่สร้าง
6. คอลัมน์ตามแบบแนบท้ายฯ: `วัน/เดือน/ปี | รายการ | รายรับ (บาท) | รายจ่าย(บาท): ซื้อสินค้า | รายจ่าย(บาท): ค่าใช้จ่ายอื่นๆ | หมายเหตุ`
7. รายจ่ายลงช่อง **ซื้อสินค้า** เมื่อ `categoryId` หรือ `subCategoryId` อยู่ในชุดที่ผู้ใช้เลือกไว้ มิฉะนั้นลง **ค่าใช้จ่ายอื่นๆ**
8. ค่าตั้งต้นของชุด “ซื้อสินค้า” เดาจากชื่อหมวด (`วัตถุดิบ|สินค้า|ของสด|ของแห้ง|ซื้อ|ต้นทุน`) แก้ได้ในหน้าจอ และจำไว้ใน `localStorage`
9. ตัดยอด **รวมต่อเดือน** ทุกเดือนที่มีรายการ และ **รวมทั้งช่วง** + บรรทัด **กำไรจากการขาย** (= รายรับ − ซื้อสินค้า − ค่าใช้จ่ายอื่นๆ)
10. วันที่แสดงเป็นปี พ.ศ. ภาษาไทย
11. หัวเอกสาร: ชื่อผู้ประกอบกิจการ (แก้ได้ ค่าตั้งต้น = ชื่อผู้ใช้ที่ล็อกอิน), ชื่อสถานประกอบการ + ที่อยู่ (จาก workspace), เลขประจำตัวผู้เสียภาษีอากร (จาก workspace)
12. ด่านเตือนก่อนออกไฟล์ (ไม่บล็อก): จำนวน/ยอดรายการ `scope === 'business'` ที่อยู่ในกระเป๋าที่ **ไม่ได้ติ๊ก** · จำนวนรายการที่ไม่มีสลิป · จำนวนรายการที่ลงบันทึกช้ากว่า 3 วันทำการ · จำนวนรายการที่ยังรออนุมัติแก้ไข
13. แสดงรายรับสะสมเทียบเพดาน VAT 1,800,000 บาท โดย **ไม่นับ** เงินคืนจากคู่ค้า (`sourceChannel === 'pending_bill'` และ `type === 'income'`) ในฐานคำนวณ และบอกยอดที่ไม่นับให้เห็น
14. ปุ่มดาวน์โหลด PDF / Excel / CSV ใช้ชุดข้อมูลเดียวกัน ชื่อไฟล์ระบุช่วงปี

## 8. Edge and error behavior

| ID | Condition | Expected | Criticality |
|---|---|---|---|
| E-01 | ไม่ติ๊กกระเป๋าเลย | ปุ่มดาวน์โหลดถูกปิด + ข้อความ “เลือกอย่างน้อย 1 กระเป๋า” | High |
| E-02 | ช่วงที่เลือกไม่มีรายการ | ตารางว่างพร้อมข้อความ ยอดรวมทุกช่องเป็น 0 ดาวน์โหลดได้ | Normal |
| E-03 | รายการเกิน 1,000 แถว | `collectPaginatedItems` วนจนครบ ไม่ตัดท้าย | Critical |
| E-04 | โหลด API ล้มเหลว | ข้อความ error + ปุ่มลองใหม่ ไม่แสดงตัวเลขบางส่วน | High |
| E-05 | workspace ยังไม่ได้กรอกเลขผู้เสียภาษี | ขึ้นเส้นประว่างในหัวเอกสาร + เตือนให้ไปกรอกที่ “ข้อมูลร้านค้า” | Normal |
| E-06 | โหลดฟอนต์ PDF ไม่สำเร็จ | ข้อความผิดพลาดชัดเจน ไม่สร้างไฟล์ที่อ่านไม่ออก | High |
| E-07 | `localStorage` อ่าน/เขียนไม่ได้ | ใช้ค่า default เดินต่อได้ ไม่ throw | Normal |
| E-08 | รายการมี `amount` เป็นค่าติดลบหรือไม่ใช่ตัวเลข | ปัดเป็น 0 และนับรวมใน “รายการผิดปกติ” | High |

## 9. Security and operational constraints

- Authorization: หน้าใหม่อยู่หลัง `RequireAuth` + `RequireAdmin` เหมือนหน้ารายงานเดิม; server-side ยังคุมด้วย token เดิม
- ไม่มี secret ใหม่ · ไม่มี network call ใหม่นอกจาก endpoint เดิมที่ผู้ใช้มีสิทธิ์อยู่แล้ว
- ไฟล์ที่สร้างอยู่ในเครื่องผู้ใช้ทั้งหมด ไม่มีการอัปโหลด
- ค่าที่จำใน `localStorage` เป็นค่าตั้งค่าการแสดงผล ไม่ใช่ข้อมูลการเงินหรือ PII

## 10. Impact Map

| ID | Change | Upstream | Downstream | Failure mode | Regression evidence |
|---|---|---|---|---|---|
| IMP-01 | `export` 2 ฟังก์ชันใน `walletExport.js` | ไม่มี | `WalletDetail` PDF export เดิม | ถ้าพลาดไปแก้ logic ฟอนต์ → PDF กระเป๋าเดิมพัง | T-10, B-01, B-03 |
| IMP-02 | เพิ่ม route `/cash-book` | `App.jsx` | ทุกหน้า (router) | route ชนของเดิม → หน้าอื่นพัง | T-11, B-03 |
| IMP-03 | เพิ่ม nav item | `Layout.jsx` | เมนูทุก role | staff เห็นเมนูที่กดแล้วเด้งกลับ | T-12 |
| IMP-04 | โมดูลคำนวณใหม่ | API เดิม | ตัวเลขในไฟล์ที่ยื่นภาษี | ตัวเลขผิด → ยื่นผิด | T-01…T-09 |

## 11. Implementation plan

| Step | Files | Delivers | Check |
|---|---|---|---|
| 1 | `src/cashBook.js`, `src/cashBook.test.mjs` | logic + tests | `node --test src/cashBook.test.mjs` |
| 2 | `src/walletExport.js` | export ตัวโหลดฟอนต์ | `node --test`, `npm run build` |
| 3 | `src/cashBookExport.js` | PDF/XLS/CSV | `npm run build` |
| 4 | `src/pages/CashBook.jsx` | หน้าจอ | `npm run build`, `npm run lint` |
| 5 | `src/App.jsx`, `src/Layout.jsx` | route + เมนู | `npm run build`, `npm run lint` |

## 12. Test Matrix

| ID | Req | Layer | Scenario | Expected | Criticality |
|---|---|---|---|---|---|
| T-01 | §7.4 | unit | มีรายการโอนภายใน + ฉบับร่างปนมา | ไม่เข้ารายงานและไม่เข้ายอดรวม | Critical |
| T-02 | §7.4 | unit | รายการอยู่ในกระเป๋าที่ไม่ได้ติ๊ก | ไม่เข้ารายงาน | Critical |
| T-03 | §7.7 | unit | รายจ่ายหมวด “วัตถุดิบ” vs “ค่าไฟ” | ลงช่องซื้อสินค้า / ค่าใช้จ่ายอื่นๆ ตามลำดับ | Critical |
| T-04 | §7.9 | unit | ข้ามเดือน | มีแถวรวมของทุกเดือนที่มีรายการ และรวมทั้งช่วงถูกต้อง | Critical |
| T-05 | §7.9 | unit | กำไรจากการขาย | = รายรับ − ซื้อสินค้า − ค่าใช้จ่ายอื่นๆ | Critical |
| T-06 | §7.12 | unit | มีรายการ business ในกระเป๋าที่ไม่ติ๊ก | คำเตือนบอกจำนวนและยอดถูกต้อง | Critical |
| T-07 | §7.12 | unit | บันทึกช้ากว่า 3 วันทำการ (ข้ามเสาร์–อาทิตย์) | ถูกนับเป็น late ตามจริง | High |
| T-08 | §7.13 | unit | มีเงินคืนจากคู่ค้า | ฐาน VAT ไม่นับรายการนั้น | High |
| T-09 | §8 E-08 | unit | `amount` เป็น `null`/ติดลบ | นับเป็น 0 + เข้ารายการผิดปกติ | High |
| T-10 | IMP-01 | static+build | PDF กระเป๋าเดิม | `node --test` + build ผ่านเท่าเดิม | Critical |
| T-11 | IMP-02 | build | route ใหม่ | build ผ่าน | Critical |
| T-12 | IMP-03 | static | nav item ตั้ง `admin: true` | ตรงกับหน้า `/reports` | High |
| T-13 | §7 ทั้งหมด | manual | เปิดหน้าจริงบนเบราว์เซอร์ + กดดาวน์โหลด | ต้องมีข้อมูลจริงและต้องล็อกอิน | Normal |

## 13. Acceptance criteria

| ID | Criterion | Criticality | Evidence |
|---|---|---|---|
| A-01 | ตัวเลขรวมตรงกับสูตร รายรับ − ซื้อสินค้า − อื่นๆ และไม่รวมรายการโอน/ร่าง | Critical | T-01, T-04, T-05 |
| A-02 | เลือกกระเป๋าได้ และรายการนอกกระเป๋าที่เลือกไม่หลุดเข้ามา | Critical | T-02 |
| A-03 | คำเตือน “รายจ่ายธุรกิจอยู่ในกระเป๋าที่ไม่ได้ติ๊ก” ทำงาน | Critical | T-06 |
| A-04 | คอลัมน์และหัวเอกสารตรงแบบแนบท้ายประกาศฯ 161 | Critical | review ต่อ `docs/cash-book` + สายตา |
| A-05 | ไม่มี regression: `node --test` 46 pass, `npm run build` exit 0, lint ไม่เพิ่ม error | Critical | B-01…B-03 |
| A-06 | ไม่แตะไฟล์ใน forbidden list | Critical | `git status` |

## 14. Review and handoff plan

- Review resolver: ไม่มี reviewer แยก context ในรอบนี้ → **Fallback structured self-review** (`reviewer independence: false`)
- Handoff: ไฟล์นี้ + ตาราง evidence ท้ายไฟล์
- Confidentiality: **LOCAL ONLY** — ไม่ commit/push/deploy จนกว่าจะได้รับอนุญาตแยก

## 15. Rollback Plan

| Layer | Restore source | Target | Action | Verification |
|---|---|---|---|---|
| Code (ไฟล์ใหม่) | ไม่มีของเดิมให้คืน | `src/cashBook.js`, `src/cashBook.test.mjs`, `src/cashBookExport.js`, `src/pages/CashBook.jsx`, `docs/cash-book/` | ลบไฟล์ที่ระบุ (ทีละไฟล์ ห้ามลบทั้งโฟลเดอร์ `src`) | `npm run build` exit 0 |
| Code (ไฟล์ที่แก้) | backup นอก repo: `<scratchpad>/checkpoint-cashbook/` + `manifest.sha256` | `src/walletExport.js`, `src/App.jsx`, `src/Layout.jsx` | คัดลอกทับทีละไฟล์จาก backup | `node --test` 46 pass + `npm run build` exit 0 |
| Data | ไม่มี | — | — | — |
| Config/infra | ไม่มี | — | — | — |

- ไม่มี migration ไม่มีการเปลี่ยน production → rollback = คืน 3 ไฟล์ + ลบไฟล์ใหม่ จบ
- `git reset`/`git checkout .` **ห้ามใช้** เพราะจะกินงานอื่นใน worktree
- ผู้มีสิทธิ์สั่ง rollback: เจ้าของ

## 16. Assumptions, changelog, deviations

| ID | Assumption | ผลถ้าผิด |
|---|---|---|
| A1 | ร้านเป็นบุคคลธรรมดา | ต้องเปลี่ยนเป็นไฟล์ตั้งต้นลงบัญชี — เจ้าของยืนยันแล้ว 15 ก.ย. 2569 |
| A2 | ยังไม่จด VAT | ประกาศฯ 161 จะไม่บังคับใช้ — เจ้าของยืนยันแล้ว |
| A3 | `date` = วันที่เงินเข้าออกจริง | ผิดเกณฑ์เงินสดตามคำอธิบายข้อ 6 ของแบบ |
| A4 | หมวดหมู่แยกต้นทุนสินค้าออกจากค่าใช้จ่ายอื่นได้ | ยอด “ซื้อสินค้า” เพี้ยน → บรรทัดกำไรผิด (มีตัวติ๊กแก้ในหน้าจอ) |
| A5 | “3 วันทำการ” นับเฉพาะเสาร์–อาทิตย์เป็นวันหยุด ไม่รู้จักวันหยุดนักขัตฤกษ์ | คำเตือนอาจ false positive ในสัปดาห์ที่มีวันหยุด — เป็นคำเตือน ไม่ใช่ตัวเลขในรายงาน |
| A6 | รายรับสะสมยังไม่เกินเพดาน VAT 1.8 ล้าน | ถ้าเกินแล้วต้องจดภายใน 30 วัน และเปลี่ยนชนิดรายงาน — **ยังไม่ปิด** |

| Revision | Change | Reason | Approved |
|---|---|---|---|
| 1 | spec แรก | — | 2026-09-15 “เริ่ม Phase 1 เลย” |

**Deviation log:** (เติมตอนจบ)

---

## 17. Evidence (Gate 3)

**Revision:** spec 1 · code = working tree บน `claude/think360-annual-report-export-2c8955` (ฐาน `223e10b`) · รัน 15 ก.ย. 2569

### Regression baseline vs after

| ID | Command | Scope | Before | After | Delta | State |
|---|---|---|---|---|---|---|
| B-01 | `node --test` | repo root | 46 pass / 0 fail | 60 pass / 0 fail | +14 (ของใหม่ทั้งหมด) | PASS |
| B-02 | `npx eslint . -f json` | repo root | 51 err / 2 warn | 51 err / 2 warn | เท่าเดิมทุกไฟล์ | PASS (แดงเดิมคงไว้ ไม่เพิ่ม) |
| B-03 | `npm run build` | repo root | exit 0 | exit 0 + chunk `cashBookExport-*.js` 9.75 kB | ไม่มี error | PASS |
| B-04 | `git status --porcelain` | repo root | clean | แก้ 3 ไฟล์ + เพิ่ม 5 ไฟล์ ตรง manifest | ไม่มีไฟล์นอก manifest | PASS |

lint baseline รายไฟล์ (คงเดิมทั้งหมด): `api/line-webhook.js` 10 · `worker.js` 9 · `Transactions.jsx` 5 · `functions/api/line-webhook.js` 4 · `PendingBills.jsx` 4+2w · `AuthContext.jsx` 2 · `Reports.jsx` 2 · `Users.jsx` 2 · `useWs.js` 2 · อีก 9 ไฟล์ ไฟล์ละ 1

### Test Matrix

| ID | Scenario | State | Evidence |
|---|---|---|---|
| T-01 | ตัดรายการโอนภายใน + ฉบับร่าง | PASS | `cash book keeps only posted income and expense...` |
| T-02 | ตัดกระเป๋าที่ไม่ได้ติ๊ก | PASS | เทสต์เดียวกัน |
| T-03 | แยกช่องซื้อสินค้า / ค่าใช้จ่ายอื่นๆ | PASS | `expenses split into the goods column...` |
| T-04 | รวมรายเดือน + เรียงตามปฏิทิน | PASS | `rows are grouped into month subtotals...` |
| T-05 | กำไรจากการขาย | PASS | T-03 + สคริปต์เทียบตัวอย่างด้านล่าง |
| T-06 | คำเตือนรายการ business นอกกระเป๋าที่ติ๊ก | PASS | `business spending left in an unticked wallet...` |
| T-07 | 3 วันทำการ (ข้ามเสาร์-อาทิตย์ + UTC→ไทย) | PASS | `late entries follow business days...` |
| T-08 | เงินคืนคู่ค้าออกจากฐาน VAT | PASS | `vendor refunds stay in the report...` |
| T-09 | amount null/ติดลบ | PASS | `a broken amount becomes zero...` |
| T-10 | PDF กระเป๋าเดิมไม่พัง | PASS | B-01 + B-03 (แก้แค่คำว่า `export` — diff ยืนยัน) |
| T-11 | route ใหม่ | PASS | B-03 |
| T-12 | nav item เป็น admin-only | PASS | อ่าน diff `Layout.jsx` — `admin: true` ตรงกับ `/reports` |
| T-13 | เปิดหน้าจริงบนเบราว์เซอร์ พร้อมข้อมูลจริง | **NOT-RUN** | ต้องล็อกอินด้วยบัญชีเจ้าของ — ผู้ช่วยไม่กรอกรหัสผ่านให้ (Normal) |
| T-14 | แถวตาราง: ช่องว่างเมื่อไม่มียอด / แถวรวมพิมพ์ 0.00 | PASS | `table rows leave empty money cells blank...` |
| T-15 | โครงคอลัมน์ 161 ใน Excel + escape ข้อความผู้ใช้ | PASS | `the Excel document carries the 161 column layout...` |
| T-16 | หัวคอลัมน์ CSV + บรรทัดยอดรวม/กำไร | PASS | `the CSV keeps the form columns first...` |
| T-17 | เทียบยอดกับ "ตัวอย่าง" ที่กรมสรรพากรแนบมากับแบบ | PASS | ดูด้านล่าง |

### T-17 — เทียบกับตัวอย่างต้นฉบับของกรมสรรพากร

ป้อนรายการเดียวกับตัวอย่างแนบท้ายแบบ (ขายสินค้า 12,000/23,000/15,000 · ค่าโทรศัพท์ 850 · ค่าน้ำมัน 500 · ซื้อสินค้า 21,000 · ค่าน้ำค่าไฟ 1,250 · ค่าเช่าร้าน 10,000 · ค่าแรง 12,000):

| ช่อง | ต้นฉบับกรมสรรพากร | ที่โปรแกรมคำนวณได้ |
|---|---|---|
| รายรับ | 50,000 | **50,000.00** |
| ซื้อสินค้า | 21,000 | **21,000.00** |
| ค่าใช้จ่ายอื่นๆ | 24,600 | **24,600.00** |
| กำไรจากการขาย | 4,400 | **4,400.00** |

โครงเอกสารที่ออกมา: หัวตารางสองชั้น (`รายจ่าย (บาท)` คร่อม `ซื้อสินค้า` + `ค่าใช้จ่ายอื่นๆ`) · วันที่เป็น พ.ศ. · ช่องที่ไม่มียอดเว้นว่าง · แถว `รวม <เดือน>` ท้ายทุกเดือน · `รวมทั้งสิ้น` · บล็อก `สรุป` ปิดท้ายด้วย `กำไรจากการขาย` · ไม่มีช่อง `คงเหลือ`

### Review

| Field | Value |
|---|---|
| reviewer workflow | fallback structured self-review |
| **context isolated** | **false** |
| builder = reviewer | true |
| spec revision | 1 |

| ID | File | Severity | Finding | Triage |
|---|---|---|---|---|
| F-01 | `src/pages/CashBook.jsx` | MAJOR | สร้างไฟล์ล้ม (เช่น โหลดฟอนต์ไม่ได้ ตาม E-06) เขียนทับ `error` ตัวเดียวกับตอนโหลดข้อมูล ทำให้ทั้งหน้าถูกแทนด้วยกล่อง error และตัวเลขที่คำนวณไว้แล้วหายหมด | ACCEPT → แยก `exportError` แสดงใต้ปุ่ม · retest B-01/B-02/B-03 |
| F-02 | `src/pages/CashBook.jsx` | MINOR | ปุ่มติ๊กกระเป๋า/หมวด เป็น `<button>` ไม่มี `aria-pressed` — screen reader ไม่รู้ว่าติ๊กอยู่ไหม | ACCEPT → เพิ่ม `aria-pressed` / `aria-expanded` |
| F-03 | `src/cashBook.js` | MINOR | CSV formula injection — เซลล์ที่ขึ้นต้นด้วย `=`, `+`, `-`, `@` ถูก Excel ตีความเป็นสูตรได้ แม้ครอบ quote แล้ว | REJECT (นอก frozen scope · พฤติกรรมเดียวกับ `csvUtils.js` เดิม แก้ที่เดียวไม่จบ) → ตั้งเป็น follow-up |
| F-04 | `src/cashBook.js` | NIT | `businessDaysBetween` ไม่รู้จักวันหยุดนักขัตฤกษ์ | REJECT — ประกาศไว้แล้วใน A5 และเป็นคำเตือน ไม่ใช่ตัวเลขในรายงาน |

ตรวจตาม Fallback Review Checklist: spec compliance (§7 ทุกข้อมีแถว evidence) · scope (`git status` ไม่มีไฟล์นอก manifest) · correctness (ขอบเขต null/0/ติดลบ, timezone, การเรียงลำดับที่ทำซ้ำได้) · interfaces (I-03 เป็น additive, ของเดิมเรียกใช้เหมือนเดิม) · security (escape HTML มีเทสต์ · ไม่มี secret · ไม่มี network ใหม่ · F-03 บันทึกไว้) · reliability (ล้มตอน export ไม่ทำลายหน้าจอแล้ว) · operations (rollback ตาม §15 · ไม่มี migration) · tests (มีทั้ง happy/edge/error + เทียบต้นฉบับ)

### Verdict

**SHIP WITH UNVERIFIED ITEMS** — critical ทุกแถว PASS · เหลือ T-13 (เปิดหน้าจริงพร้อมข้อมูลจริง) เป็น NOT-RUN เพราะต้องใช้บัญชีเจ้าของล็อกอิน ซึ่งผู้ช่วยไม่ทำแทน · ยังไม่ commit/push/deploy

### 18. Deviation log

| ID | ต่างจาก frozen spec ตรงไหน | เหตุผล | Retest |
|---|---|---|---|
| D-01 | `buildCashBookHtml` / `buildCashBookCsv` / `buildCashBookTableRows` / `cashBookMoney` / `cashBookHeaderLines` ย้ายจาก `cashBookExport.js` ไปอยู่ใน `cashBook.js` | `cashBookExport.js` ต้อง import ฟอนต์ผ่าน `?url` ของ Vite ซึ่ง `node --test` โหลดไม่ได้ — เนื้อหาที่ส่งสรรพากรต้องทดสอบได้ จึงแยกส่วนเขียนไฟล์ออกจากส่วนประกอบข้อความ ไม่เปลี่ยน contract ภายนอกของทั้งสองไฟล์ | T-14…T-16 + B-01…B-04 |
| D-02 | เพิ่ม state `exportError` ในหน้าจอ | แก้ F-01 | B-01…B-03 |
| D-03 | เพิ่ม `aria-pressed` / `aria-expanded` | แก้ F-02 | B-02, B-03 |

---

## 19. T-13 — เปิดหน้าจริงกับข้อมูลจริง (ปิดแล้ว 15 ก.ย. 2569)

เจ้าของล็อกอินใน Browser pane เอง (ผู้ช่วยไม่กรอกรหัสผ่าน) แล้วเปิด `/cash-book`

**ผลที่สังเกตได้ · ปีภาษี 2569 ทั้งปี · กระเป๋าที่ติ๊ก 4 จาก 6 ใบ**

| รายการ | ค่า |
|---|---|
| รายรับ | ฿7,996,888.00 (2,010 รายการ) |
| รายจ่าย — ซื้อสินค้า | ฿3,720,648.58 |
| รายจ่าย — ค่าใช้จ่ายอื่นๆ | ฿3,745,324.94 |
| กำไรจากการขาย | ฿530,914.48 |
| รายรับเทียบเพดาน VAT | **444.3% ของ 1.8 ล้าน** |
| คำเตือนกระเป๋าที่ไม่ได้ติ๊ก | 916 รายการ ฿2,726,626.46 (ร้านพี่อึ๊ดตำถาด 915 · เงินสดส่วนตัว 1) |
| ไม่มีหลักฐานแนบ | 985 รายการ |
| บันทึกช้ากว่า 3 วันทำการ | 21 รายการ |
| หัวเอกสาร | ชื่อผู้ประกอบกิจการเติมจากผู้ใช้อัตโนมัติ · workspace ยังเป็น “My Business” และ**ยังไม่มีเลขผู้เสียภาษี** → ขึ้นคำเตือนตาม E-05 ถูกต้อง |

สรุปรายเดือนแสดง ม.ค. เม.ย. พ.ค. มิ.ย. ก.ค. ส.ค. ก.ย. 2569 ครบตามข้อมูลที่มีจริง

**T-13 = PASS** (ยกเว้นการกดดาวน์โหลดจริง ซึ่งเจ้าของกดเองได้จากหน้านั้น)

## 20. F-05 — bug ที่เจอจากการเปิดหน้าจริง (แก้แล้ว)

| ID | File | Severity | Finding |
|---|---|---|---|
| F-05 | `src/pages/CashBook.jsx` | **MAJOR** | คำตอบของช่วงเวลาเก่ากลับมาทับของใหม่ได้ |

**อาการที่เห็น:** หน้าจอแสดงหัวรายงาน “ทั้งปี (1 ม.ค. – 31 ธ.ค. 2569)” แต่ตารางสรุปรายเดือนมีแค่ ม.ค.–มิ.ย. และยอดรวมเป็นของครึ่งปีแรก ขณะที่ `loading` เป็น false แล้ว

> **แก้ไขข้อสรุปเรื่องหลักฐาน (บันทึกภายหลัง):** ตอนที่สังเกตอาการนี้ เจ้าของกำลังกดสลับช่วงเวลาและติ๊ก/ปลดกระเป๋าอยู่บนหน้าเดียวกัน ตัวเลขที่เห็นเปลี่ยนไปมาจึงอธิบายได้ด้วยการกดของผู้ใช้เช่นกัน — **ภาพที่เห็นไม่ใช่หลักฐานยืนยัน race** สิ่งที่ยืนยันได้จริงคือ *ตัวโค้ดไม่มี request-sequencing guard* (ตรวจจากโค้ดตรง ๆ) ซึ่งทำให้คำตอบที่มาถึงทีหลังทับของใหม่ได้แน่นอนเมื่อเกิดขึ้น และ T-18 ยืนยันว่าหลังใส่ guard แล้วผลลัพธ์ผูกกับรอบล่าสุดเสมอ

**RCA**

| Field | Answer |
|---|---|
| Failure & impact | หัวรายงานบอกช่วงหนึ่ง ตัวเลขเป็นอีกช่วงหนึ่ง — ถ้ากดออกไฟล์ตอนนั้นจะได้เอกสารภาษีที่ผิดโดยไม่มีอะไรฟ้อง |
| Minimal reproduction | กด “ครึ่งปีแรก” แล้วกด “ทั้งปี” ทันที ระหว่างที่ยังดึงข้อมูลไม่เสร็จ |
| กลไก | ทั้งปีต้องดึง ~3,000 แถว (3 รอบ รอบละ 1,000) ปุ่มเลือกช่วงอยู่นอกบล็อก `loading` จึงกดสลับได้ระหว่างโหลด · `load()` ไม่มีตัวนับรอบ คำตอบที่มาถึงทีหลังจึง `setSource` ทับเสมอ ไม่ว่าจะเป็นรอบล่าสุดหรือไม่ |
| Why earlier gates missed it | unit test ทดสอบ `buildCashBook` ซึ่งเป็นฟังก์ชันล้วน ไม่มี state/async · `npm run build` ไม่จับ race · ตัว pattern กันเรื่องนี้มีอยู่แล้วใน `WalletDetail.jsx` (`loadRequestRef`) แต่ตอนเขียนหน้าใหม่ไม่ได้ลอกมา |
| Root cause | ไม่มี request-sequencing guard ใน `load()` |
| Fix | เพิ่ม `loadRequestRef` นับรอบ ทิ้งคำตอบที่ไม่ใช่รอบล่าสุดทั้งใน success/catch/finally + เพิ่มรอบตอน cleanup ของ effect (ลอก pattern จาก `WalletDetail.jsx`) |
| Residual risk | ปุ่มเลือกช่วงยังกดได้ระหว่างโหลด (ตั้งใจ — ผู้ใช้เปลี่ยนใจได้) แต่ผลลัพธ์ผูกกับรอบล่าสุดเสมอแล้ว |

**T-18 — ยืนยัน fix บนของจริง:** กด “ครึ่งปีแรก” แล้วกด “ทั้งปี” ติดกัน รอจนนิ่ง → หัวรายงาน = `ปีภาษี 2569 · ทั้งปี (1 ม.ค. 2569 – 31 ธ.ค. 2569)` และตารางมี ก.ค./ส.ค./ก.ย. ครบ → **PASS**

**Regression หลังแก้:** `node --test` 60 pass / 0 fail · `npm run build` exit 0 · eslint 51 err / 2 warn เท่า baseline ทุกไฟล์ · `git status` ยังมีเฉพาะ 8 path ใน manifest

| Deviation | รายละเอียด |
|---|---|
| D-04 | เพิ่ม `loadRequestRef` ใน `CashBook.jsx` เพื่อแก้ F-05 · ไม่เปลี่ยน contract ภายนอก |

**Verdict หลังรอบนี้: SHIP** — critical ทุกแถว PASS และ T-13 ปิดแล้ว · ยังไม่ commit/push/deploy

---

## 21. Spec revision 2 — รายจ่ายที่พิสูจน์ได้ (15 ก.ย. 2569)

**เหตุผล:** เจ้าของยืนยันว่าหลักคือ **หักตามความจำเป็นและสมควร (ตามจริง)** ไม่ใช้อัตราเหมา
เงื่อนไขของวิธีนี้คือต้องมีหลักฐานพิสูจน์ได้ (ม.8 ทวิ พระราชกฤษฎีกาฯ ฉบับที่ 11) ตัวเลขชี้ขาดจึงเปลี่ยนจาก
“จำนวนรายการที่ไม่มีสลิป” เป็น **“จำนวนบาทของรายจ่ายที่ยันไม่ได้”**

| Revision | Change | Approved |
|---|---|---|
| 2 | §7.12 เดิมนับเฉพาะ *จำนวนรายการ* ที่ไม่มีสลิป → เพิ่ม `warnings.unevidencedExpense` = {count, amount, pct, provable} เฉพาะฝั่ง **รายจ่าย** และยกขึ้นเป็นการ์ดหลักบนหน้าจอ | 2026-09-15 “มันต้องหักตามจริงที่เกิดขึ้นจริง” |

| ID | Scenario | State | Evidence |
|---|---|---|---|
| T-19 | รายจ่ายมี/ไม่มีสลิป + รายรับไม่มีสลิป | PASS | `unevidenced expense is measured in baht, and income without a slip is not counted` — รายรับไม่ถูกนับเข้า `unevidencedExpense` |
| T-20 | ไม่มีรายจ่ายเลย | PASS | `a report with no expenses reports zero unevidenced percent instead of NaN` — กัน pct เป็น NaN |
| T-21 | แสดงผลบนข้อมูลจริง | PASS | ปีภาษี 2569 ทั้งปี 5/6 กระเป๋า → พิสูจน์ได้ ฿5,086,339.91 จาก ฿8,592,980.98 (59.2%) · ยันไม่ได้ ฿3,506,641.07 จาก 1,246 รายการ (40.8%) |

**Regression:** `node --test` 62 pass / 0 fail · `npm run build` exit 0 · eslint 51 err / 2 warn เท่า baseline ทุกไฟล์

| Deviation | รายละเอียด |
|---|---|
| D-05 | ย้ายตัวนับ “ไม่มีหลักฐานแนบ” ออกจากแถบคำเตือนบาง ๆ ขึ้นมาเป็นการ์ดของตัวเอง เพราะกลายเป็นตัวเลขหลักของการหักตามจริง ไม่ใช่หมายเหตุ |

### 21.1 แยกยอดที่ยันไม่ได้รายหมวด (spec revision 2 ต่อ)

`warnings.unevidencedExpense.byCategory` = `[{ name, count, amount, pct }]` เรียงจากยอดมากไปน้อย
ใช้ชื่อหมวดย่อยก่อนหมวดหลัก · รวมชื่อซ้ำเข้าด้วยกัน · ไม่รวมฝั่งรายรับ · หน้าจอแสดง 8 อันดับแรกพร้อมแถบเทียบสัดส่วน ที่เหลือยุบเป็นบรรทัดเดียว

| ID | Scenario | State | Evidence |
|---|---|---|---|
| T-22 | เรียงลำดับ + ไม่เอาหมวดของรายรับมาปน | PASS | `unevidenced expense is measured in baht, and income without a slip is not counted` |
| T-23 | ชื่อหมวดซ้ำถูกรวม + ใช้ชื่อหมวดย่อยก่อน + ไม่มีหมวดเป็น “ไม่ระบุหมวดหมู่” | PASS | `unevidenced categories merge duplicate names and prefer the sub-category label` |
| T-24 | บนข้อมูลจริง ปีภาษี 2569 ทั้งปี · 5 กระเป๋าธุรกิจ | PASS | ยันไม่ได้ ฿3,506,641.07 / 1,246 รายการ กระจาย 77 หมวด · 12 อันดับแรกครอบคลุม ~77% |

**Regression:** `node --test` 63 pass / 0 fail · `npm run build` exit 0 · eslint เท่า baseline
