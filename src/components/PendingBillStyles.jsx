// สไตล์ของหน้าคิวบิลรอจ่าย — แยกออกมาเหมือน MerchantRowStyles เพราะยาวและไม่มี logic
//
// ที่มาของดีไซน์นี้: หน้าเดิมเป็นการ์ดที่วาดทุกใบเท่ากันหมด
//   ป้าย "หลักฐานแข็ง" ขึ้นครบ 10/10 ใบ · "รอคู่ค้ายืนยัน" ขึ้นทุกใบวางบิล
//   คือความผิดพลาดเดียวกับหน้าร้านค้ารอบแรก (ดู MerchantRowStyles.jsx):
//   ตัวบอกที่ทุกแถวเหมือนกันให้ข้อมูล 0 บิต เป็น noise ไม่ว่าจะแต่งยังไง
// รอบนี้จึงเหลือป้ายไว้เฉพาะ "ข้อยกเว้น" แล้วยกของที่ทุกใบเหมือนกันไปเป็นตัวเลขก้อนเดียวบนหัว
//
// ที่ว่างที่ได้คืนเอาไปใส่ของที่หายไปจริง ๆ: อายุบิล + ธงเตือนว่ายอดยังไม่ครบ
// ค่าสีทุกตัววัดบนพื้น --card #161b2e แล้ว (ข้อความ >=4.5:1 · กราฟิก >=3:1)
export default function PendingBillStyles() {
  return (
    <style>{`
.pb{
  --card:#161b2e; --line:#1f2937; --line-soft:#1c2438;
  --green:#10b981; --amber:#f59e0b; --red:#f87171;
  --ink-1:#eef2f9;   /* 15.2:1 */
  --ink-2:#b9c3d6;   /*  9.6:1 */
  --ink-3:#93a0b8;   /*  6.5:1 */
  --ctl:#64748b;     /*  3.6:1 ขอบคอนโทรล — ห้ามใช้ --rule (1.37:1) */
  --bar:#27805f;     /*  3.5:1 แท่งวัด */
  --bar-hi:#39a67c;
  --rule:#2a3448; --hover:#1b2237;
  --num:104px; --pad:10px;
}
.pb :focus-visible{outline:2px solid var(--green);outline-offset:2px;border-radius:8px}

/* ── หัวเรื่อง ─────────────────────────────────────────────── */
.pb .top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.pb .h1{margin:0;font-size:20px;font-weight:600;color:var(--ink-1)}
.pb .sum{margin:3px 0 0;font-size:13.5px;color:var(--ink-3);font-variant-numeric:tabular-nums}
.pb .acts{display:flex;gap:8px;flex-wrap:wrap}
.pb .abtn{display:inline-flex;align-items:center;gap:7px;height:44px;padding:0 15px;border-radius:9px;
  border:1px solid var(--ctl);background:#1a2136;color:var(--ink-1);font-size:13.5px;font-weight:600;
  cursor:pointer;font-family:inherit;white-space:nowrap}
.pb .abtn:hover{background:#202942;border-color:var(--green)}
.pb .abtn--go{background:var(--green);border-color:var(--green);color:#06120d}
.pb .abtn--go:hover{background:#34d399;border-color:#34d399}

/* ── แถบเตือนยอดไม่ครบ — ธงเดียวที่กันเรื่องเงิน จึงได้ที่ยืนของตัวเอง ── */
.pb .alarm{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:14px 0 0;padding:11px 14px;
  border-radius:10px;background:#b4530915;border:1px solid #6b4410;font-size:13.5px;color:var(--ink-1)}
.pb .alarm b{color:var(--amber);font-weight:600}

/* ── แถบสรุป: ของที่ทุกใบเหมือนกัน อยู่ตรงนี้ที่เดียว ไม่ใช่รายแถว ── */
.pb .rail{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:14px 0 0}
.pb .rc{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:13px 15px 14px}
.pb .rc--todo{border-left:2px solid var(--amber)}
.pb .rc h2{margin:0;font-size:11.5px;font-weight:600;letter-spacing:.07em;color:var(--ink-3)}
.pb .rc .v{display:flex;align-items:baseline;gap:7px;margin:8px 0 0;font-variant-numeric:tabular-nums}
.pb .rc .v b{font-size:25px;font-weight:600;color:var(--ink-1);line-height:1.1}
.pb .rc .v span{font-size:13px;color:var(--ink-3)}
.pb .rc .track{position:relative;height:6px;border-radius:3px;background:#0f1425;
  box-shadow:inset 0 0 0 1px var(--rule);margin:10px 0 0;overflow:hidden}
.pb .rc .track i{position:absolute;top:0;bottom:0;left:0;width:var(--p,0%);min-width:3px;
  border-radius:3px;background:var(--green)}
.pb .rc--todo .track i{background:var(--amber)}
.pb .rc p{margin:8px 0 0;font-size:12.5px;color:var(--ink-3);line-height:1.55}

/* ── แถบเครื่องมือ ─────────────────────────────────────────── */
.pb .tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:14px 0 2px}
.pb .tlabel{font-size:12.5px;color:var(--ink-3);padding-right:2px}
.pb .seg{display:inline-flex;gap:2px;padding:3px;border-radius:10px;background:#121729;
  box-shadow:inset 0 0 0 1px var(--line)}
.pb .seg-b{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 12px;border-radius:8px;
  border:0;background:none;font-size:13.5px;color:var(--ink-3);cursor:pointer;font-family:inherit;
  white-space:nowrap}
.pb .seg-b:hover{color:var(--ink-1)}
.pb .seg-b[aria-pressed="true"]{background:var(--hover);color:var(--ink-1);font-weight:600;
  box-shadow:inset 0 0 0 1px var(--rule)}
.pb .spacer{flex:1 1 auto;min-width:6px}

/* ── ตัวคิว ────────────────────────────────────────────────── */
.pb .panel{margin-top:10px;background:var(--card);border:1px solid var(--line);border-radius:14px;
  padding:0 12px 10px}
.pb .colhead{display:grid;grid-template-columns:var(--num) minmax(0,1fr);align-items:end;
  padding:14px 0 8px;border-bottom:1px solid var(--line);font-size:11.5px;letter-spacing:.06em;
  color:var(--ink-3)}
.pb .colhead .ch-a{text-align:right;padding-right:16px}
.pb .list{display:flex;flex-direction:column;margin:0;padding:0;list-style:none}
.pb .gh{padding:18px 0 6px var(--num);font-size:11.5px;font-weight:600;letter-spacing:.07em;
  color:var(--ink-3);display:flex;gap:9px;align-items:baseline}
.pb .gh .gc{font-weight:400;letter-spacing:0;font-variant-numeric:tabular-nums}
.pb .gh--todo{color:var(--amber)}

.pb .row{position:relative;display:grid;grid-template-columns:var(--num) minmax(0,1fr) auto;
  align-items:center;gap:0 12px;min-height:68px;margin:0 -10px;padding:10px var(--pad);
  border-radius:10px}
/* ห้ามใส่ content-visibility/contain ที่ .row เด็ดขาด — มันให้ paint containment
   แล้วตัดเมนู ⋯ (position:absolute) ทิ้งทั้งก้อน เจอมาแล้วตอนตรวจหน้าจอจริง
   build/lint/unit test ผ่านหมดทั้งที่เมนูกดไม่ขึ้น คิวยาวหลักสิบใบ ไม่ต้องใช้ perf trick นี้ */
/* เส้นคั่นต้องยิงผ่าน <li> เพราะ .row สองอันอยู่คนละ li — ".row + .row" ไม่เคยแมตช์
   (เจอตอน review: หน้ารันได้ ผ่าน build/lint/test แต่ไม่มีเส้นคั่นสักเส้น) */
.pb .list li + li > .row::before{content:"";position:absolute;left:var(--pad);right:var(--pad);top:0;
  height:1px;background:var(--line-soft)}
/* แท่งวัด: ยาวตามสัดส่วนยอดของใบที่ใหญ่สุด เริ่มที่เส้นเดียวกับชื่อคู่ค้า
   ทำให้ที่ว่างขวาจอกลายเป็นข้อมูล แทนที่จะเป็นความว่างเปล่า */
.pb .row::after{content:"";position:absolute;bottom:0;height:2px;border-radius:1px;
  left:calc(var(--pad) + var(--num));
  width:calc((100% - var(--pad) * 2 - var(--num)) * var(--w, 0));min-width:8px;background:var(--bar)}
.pb .row:hover{background:var(--hover)}
.pb .row:hover::after{background:var(--bar-hi)}
.pb .row.is-todo::after{background:var(--amber)}
.pb .row.is-off .who{color:var(--ink-3)}

.pb .amt{text-align:right;padding-right:16px;font-variant-numeric:tabular-nums;
  font-feature-settings:"tnum" 1;font-size:19px;font-weight:600;color:var(--ink-1);
  letter-spacing:-0.01em;line-height:1.2}
.pb .body{min-width:0}
.pb .who{display:flex;align-items:center;gap:6px;font-size:15.5px;font-weight:500;color:var(--ink-1);
  line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pb .row:hover .who{color:#fff}
.pb .meta{display:flex;align-items:baseline;gap:6px;margin-top:2px;font-size:12.5px;color:var(--ink-3);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pb .meta .sep{color:#55637f}
.pb .meta .age{font-variant-numeric:tabular-nums}
/* ป้ายที่เหลืออยู่รายแถว = ข้อยกเว้นเท่านั้น ถ้ามันขึ้นทุกแถวแปลว่าออกแบบพลาดอีกรอบ */
.pb .meta .warn{color:var(--amber);font-weight:500}
.pb .meta .bad{color:var(--red);font-weight:500}
.pb .meta .good{color:var(--green)}

/* เป้าแตะทุกตัว >= 44px ตามที่หน้าร้านค้าตั้งไว้แล้ว (MerchantRowStyles .tbtn/.cta/.lead)
   พนักงานกดจากมือถือในตลาดสด มือเปียก รีบ — 34px พลาดง่ายเกินไปสำหรับปุ่มที่จ่ายเงิน */
.pb .act{display:flex;align-items:center;gap:6px}
.pb .pay{height:44px;padding:0 16px;border-radius:8px;border:1px solid var(--ctl);background:#1a2136;
  color:var(--ink-1);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
.pb .pay:hover{border-color:var(--green);background:#202942}
.pb .more{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;
  border-radius:8px;border:1px solid var(--ctl);background:none;color:var(--ink-2);cursor:pointer;
  font-family:inherit}
.pb .more:hover{background:var(--hover);color:var(--ink-1)}
.pb .more[aria-expanded="true"]{background:var(--hover);color:var(--ink-1);border-color:var(--green)}

/* ── เมนู ⋯ — ที่อยู่ของปุ่มแก้ไขและปุ่มรองทั้งหมด ── */
.pb .menuwrap{position:relative}
.pb .menu{position:absolute;right:0;top:calc(100% + 5px);z-index:20;min-width:196px;padding:6px;margin:0;
  list-style:none;background:#1a2136;border:1px solid var(--ctl);border-radius:10px;
  box-shadow:0 12px 30px rgba(0,0,0,.55)}
.pb .menu li{margin:0}
.pb .menu button{display:flex;align-items:center;gap:9px;width:100%;height:44px;padding:0 9px;
  border:0;border-radius:7px;background:none;color:var(--ink-2);font-size:13px;font-family:inherit;
  cursor:pointer;text-align:left;white-space:nowrap}
.pb .menu button:hover{background:var(--hover);color:var(--ink-1)}
.pb .menu button.danger{color:var(--red)}
.pb .menu button.danger:hover{background:#b91c1c22;color:var(--red)}
.pb .menu hr{border:0;border-top:1px solid var(--rule);margin:5px 4px}

/* ── รายการที่กางออก ─────────────────────────────────────── */
.pb .open{margin:0 -10px;padding:2px 10px 14px calc(var(--pad) + var(--num))}
.pb .open .hint{margin:0 0 8px;font-size:12.5px;color:var(--ink-2)}
.pb .open ul{list-style:none;margin:0;padding:0;font-size:12.5px;color:var(--ink-3);
  display:grid;grid-template-columns:repeat(auto-fit,minmax(228px,1fr));gap:2px 24px}
.pb .open li{display:flex;justify-content:space-between;gap:10px;font-variant-numeric:tabular-nums}
/* ของที่ยังไม่ลงราคา = สว่างที่สุดในลิสต์ เพราะเป็นสิ่งเดียวที่ต้องลงมือทำ */
.pb .open li.todo{color:var(--ink-1)}
.pb .open li.todo i{font-style:normal;color:var(--amber);font-size:11.5px;
  text-decoration:underline dotted;text-decoration-color:#8a6a1f;text-underline-offset:3px}
.pb .open .foot{margin:10px 0 0;font-size:12.5px;color:var(--ink-3);font-variant-numeric:tabular-nums}
.pb .open .rej{margin:8px 0 0;font-size:12.5px;color:var(--red)}

.pb .empty{padding:56px 16px;text-align:center}
.pb .empty p{margin:8px 0 0;font-size:14px;color:var(--ink-2)}
.pb .watch{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:12.5px;color:var(--amber)}

@media (max-width:640px){
  .pb{--num:82px;--pad:8px}
  .pb .panel{padding:0 10px 8px;border-radius:12px}
  .pb .row{min-height:auto;grid-template-columns:var(--num) minmax(0,1fr);
    grid-template-areas:"amt body" "act act";gap:8px 10px}
  .pb .amt{grid-area:amt;font-size:17px}
  .pb .body{grid-area:body}
  .pb .act{grid-area:act;padding-left:var(--num)}
  .pb .who{white-space:normal;font-size:15px}
  /* จอแคบ: เมตาต้องไหลเป็นข้อความบรรทัดเดียวกัน ไม่ใช่ flex item ที่แตกคอลัมน์
     ("ใบ / วาง / บิล" คนละบรรทัด) — เจอตอนตรวจที่ 375px */
  .pb .meta{display:block;white-space:normal;overflow:visible;line-height:1.6}
  .pb .meta > *{margin-right:5px}
  .pb .tools .spacer{display:none}
  .pb .open{padding-left:var(--pad)}
  .pb .gh{padding-left:var(--num)}
  .pb .acts{width:100%}
  .pb .abtn{flex:1 1 auto;justify-content:center}
}
@media (prefers-reduced-motion:reduce){.pb *{transition:none !important}}
`}</style>
  )
}
