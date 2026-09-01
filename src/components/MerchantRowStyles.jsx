// สไตล์ของหน้ารายชื่อร้านค้า — แยกออกมาเพราะยาวและไม่มี logic
//
// ที่มาของดีไซน์นี้: สองรอบก่อนล้มเหลวเพราะแก้ผิดจุด
//   รอบ 1 ใส่ป้ายสีส้ม "ยังไม่มีหมวด · เอกสาร · บัญชี" ทุกแถว → ดังเกินจนกลายเป็นเสียงรบกวน
//   รอบ 2 เปลี่ยนเป็นจุดเทา 6px → วัดได้ 1.65:1 ต่ำกว่าเกณฑ์ 3:1 ครึ่งหนึ่ง คือมองไม่เห็น
// รากของปัญหาไม่ใช่ "ดังไป" หรือ "จางไป" แต่คือ: ข้อมูลครบ 0 จาก 56 ร้าน
// เมื่อทุกแถวมีสถานะเดียวกันหมด ตัวบอกรายแถวให้ข้อมูล 0 บิต — เป็น noise ไม่ว่าจะแต่งยังไง
// รอบนี้จึงย้ายมันออกจากแถวไปเป็นตัวเลขก้อนเดียวในแถบขวา แล้วเอาที่ว่างคืนให้ข้อมูลจริง
//
// ค่าสีทุกตัวผ่าน WCAG บนพื้น --card #161b2e แล้ว (ข้อความ >=4.5:1 · กราฟิก >=3:1)
export default function MerchantRowStyles() {
  return (
    <style>{`
.mp{
  --card:#161b2e; --line:#1f2937; --line-soft:#1c2438;
  --green:#10b981; --amber:#f59e0b;
  --ink-1:#eef2f9;   /* 15.2:1 */
  --ink-2:#b9c3d6;   /*  9.6:1 */
  --ink-3:#93a0b8;   /*  6.5:1 */
  --ctl:#64748b;     /*  3.6:1 ขอบคอนโทรล */
  --bar:#27805f;     /*  3.5:1 แท่งวัด */
  --bar-hi:#39a67c;
  --rule:#2a3448; --hover:#1b2237; --sel:#16223d;
  --lead:44px; --num:72px; --gutter:116px; --pad:12px;
}
.mp :focus-visible{outline:2px solid var(--green);outline-offset:2px;border-radius:8px}
.mp .tnum{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}

.mp .cols{display:flex;align-items:flex-start;gap:32px}
.mp .main{flex:1 1 auto;min-width:0}
.mp .rail{flex:0 0 300px;position:sticky;top:16px}

.mp .tabs{display:flex;gap:2px;border-bottom:1px solid var(--line);overflow-x:auto;scrollbar-width:none}
.mp .tabs::-webkit-scrollbar{display:none}
.mp .tab{flex:none;display:inline-flex;align-items:center;gap:8px;height:46px;padding:0 14px;margin-bottom:-1px;
  background:none;border:0;border-bottom:2px solid transparent;font-size:14.5px;color:var(--ink-3);cursor:pointer;white-space:nowrap}
.mp .tab:hover{color:var(--ink-1)}
.mp .tab .c{font-size:13px;color:var(--ink-3);font-variant-numeric:tabular-nums}
.mp .tab[aria-current="page"]{color:var(--ink-1);font-weight:600;border-bottom-color:var(--green)}
.mp .tab[aria-current="page"] .c{color:var(--ink-2)}

.mp .search{position:relative;margin:14px 0 2px}
.mp .search svg{position:absolute;left:2px;top:50%;transform:translateY(-50%);color:var(--ink-3);pointer-events:none}
.mp .search input{width:100%;height:50px;padding:0 0 0 30px;background:transparent;border:0;border-bottom:1px solid var(--line);
  font-size:16px;color:var(--ink-1)}
.mp .search input::placeholder{color:var(--ink-3)}
.mp .search input:focus{outline:none;border-bottom-color:var(--green)}

.mp .tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:10px 0 4px}
.mp .tlabel{font-size:12.5px;color:var(--ink-3);padding-right:2px}
.mp .seg{display:inline-flex;gap:2px;padding:3px;border-radius:10px;background:#121729;box-shadow:inset 0 0 0 1px var(--line)}
.mp .seg-b{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 12px;border-radius:8px;border:0;background:none;
  font-size:13.5px;color:var(--ink-3);cursor:pointer;white-space:nowrap}
.mp .seg-b:hover{color:var(--ink-1)}
.mp .seg-b[aria-pressed="true"]{background:var(--hover);color:var(--ink-1);font-weight:600;box-shadow:inset 0 0 0 1px var(--rule)}
.mp .tbtn{display:inline-flex;align-items:center;gap:7px;height:44px;padding:0 12px;border:0;border-radius:9px;background:transparent;
  color:var(--ink-3);font-size:13.5px;cursor:pointer;font-variant-numeric:tabular-nums;white-space:nowrap}
.mp .tbtn:hover{background:var(--hover);color:var(--ink-1)}
.mp .tbtn[aria-pressed="true"]{color:var(--ink-1);background:var(--hover);font-weight:600}
.mp .spacer{flex:1 1 auto;min-width:6px}

.mp .selbar{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:6px 0 2px;font-size:13.5px;color:var(--ink-2)}
.mp .selbar .n{color:var(--green);font-weight:600;font-variant-numeric:tabular-nums}
.mp .selbar button{background:none;border:0;padding:0 2px;height:44px;cursor:pointer;color:var(--ink-1);font-size:13.5px;
  text-decoration:underline;text-decoration-color:#55637f;text-underline-offset:4px}
.mp .selbar button:hover{text-decoration-color:var(--green)}
.mp .selbar select{background:#0d1120;border:1px solid var(--rule);border-radius:8px;height:38px;padding:0 8px;
  color:var(--ink-1);font-size:13px}

.mp .panel{margin-top:10px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:0 14px 14px}
.mp .colhead{display:grid;grid-template-columns:var(--lead) var(--num) minmax(0,1fr);align-items:end;padding:16px 0 9px;margin:0 -2px;
  border-bottom:1px solid var(--line);font-size:11.5px;letter-spacing:.06em;color:var(--ink-3)}
.mp .colhead .ch-n{grid-column:2;text-align:right;padding-right:16px}
.mp .colhead .ch-b{grid-column:3}

.mp .list{display:flex;flex-direction:column;margin:0;padding:0;list-style:none}
.mp .gh{position:sticky;top:0;z-index:4;margin:0 -14px;padding:22px 14px 7px calc(var(--gutter) + 14px);background:var(--card);
  font-size:11.5px;font-weight:600;letter-spacing:.07em;color:var(--ink-3);display:flex;gap:10px;align-items:baseline}
.mp .gh .gc{font-weight:400;letter-spacing:0;font-variant-numeric:tabular-nums}

.mp .row{position:relative;display:grid;grid-template-columns:var(--lead) var(--num) minmax(0,1fr);align-items:center;
  min-height:66px;margin:0 -12px;padding:11px var(--pad);border-radius:10px;
  content-visibility:auto;contain-intrinsic-size:auto 66px}
.mp .row::before{content:"";position:absolute;left:0;right:0;top:0;height:1px;background:var(--line-soft)}
/* แท่งวัด: ยาวตามสัดส่วนของค่าที่กำลังเรียง เริ่มที่เส้นเดียวกับชื่อร้าน
   นี่คือสิ่งที่ทำให้ที่ว่างขวาจอกลายเป็นข้อมูล แทนที่จะเป็นความว่างเปล่า */
.mp .row::after{content:"";position:absolute;bottom:0;height:2px;border-radius:1px;
  left:calc(var(--pad) + var(--gutter));
  width:calc((100% - var(--pad) * 2 - var(--gutter)) * var(--w, 0));
  min-width:10px;background:var(--bar)}
.mp .row:hover{background:var(--hover)}
.mp .row:hover::after{background:var(--bar-hi)}
.mp .row.is-sel{background:var(--sel);box-shadow:inset 2px 0 0 var(--green)}
.mp .row.is-off .name{color:var(--ink-3);text-decoration:line-through}

.mp .lead{position:relative;z-index:3;display:flex;align-items:center;width:44px;height:44px;margin-left:-6px;cursor:pointer}
.mp .pick{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.mp .box{width:18px;height:18px;flex:none;border:1.5px solid var(--ctl);border-radius:5px;display:flex;align-items:center;
  justify-content:center;opacity:0;transition:opacity .12s ease,background-color .12s ease,border-color .12s ease}
.mp .box svg{opacity:0;color:#06120d}
.mp .row:hover .box,.mp .row:focus-within .box,.mp.sel-mode .box{opacity:1}
.mp .pick:checked + .box{background:var(--green);border-color:var(--green);opacity:1}
.mp .pick:checked + .box svg{opacity:1}
.mp .pick:focus-visible + .box{opacity:1;outline:2px solid var(--green);outline-offset:2px}

/* คอลัมน์ค่าที่กำลังเรียง — สมอตาซ้ายมือ แทนที่ avatar ที่ไม่มีข้อมูลจะเอามาใส่ */
.mp .num{text-align:right;padding-right:16px;font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1;letter-spacing:-0.01em}
.mp .t1{font-size:22px;font-weight:600;color:var(--ink-1)}
.mp .t2{font-size:18px;font-weight:500;color:var(--ink-2)}
.mp .t3{font-size:16px;font-weight:400;color:var(--ink-3)}
.mp .kd{font-size:16px;font-weight:500;color:var(--ink-2);white-space:nowrap}

.mp .body{display:block;min-width:0}
.mp .body::after{content:"";position:absolute;inset:0;z-index:1;border-radius:10px}
.mp .name{display:flex;align-items:center;gap:6px;font-size:16px;font-weight:500;color:var(--ink-1);line-height:1.35;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mp .row:hover .name{color:#fff}
.mp .ok{flex:none;color:var(--green)}
.mp .meta{display:flex;align-items:baseline;gap:7px;margin-top:3px;font-size:12.5px;color:var(--ink-3);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mp .meta .sep{color:#55637f}
.mp .seen{font-variant-numeric:tabular-nums}
/* ชนิดเอกสารเป็นข้อความ + รูปทรงไอคอนต่างกัน 4 แบบ ไม่ใช่ป้ายสี
   เก็บครบทั้ง 4 แบบเพราะผลทางภาษีต่างกันคนละเรื่อง (เต็มรูป/ย่อ/บิลเงินสด/ไม่มี) */
.mp .doc{display:inline-flex;align-items:center;gap:5px;flex:none}
.mp .doc svg{flex:none;opacity:.85}
.mp .doc--none{color:var(--ink-2)}
.mp .doc--full,.mp .doc--short,.mp .doc--receipt{color:var(--ink-3)}
/* ของที่ยังไม่กรอก = สว่างที่สุดในบรรทัดเมตา โดยไม่ใช้สีเลย จึงไม่พึ่งสีสื่อความหมาย */
.mp .doc--unset{color:var(--ink-1)}
.mp .doc--unset .t{text-decoration:underline dotted;text-decoration-color:#7b8aa6;text-underline-offset:3px}

.mp .foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:18px 0 0;
  padding-left:calc(var(--gutter) + 14px);font-size:12.5px;color:var(--ink-3);font-variant-numeric:tabular-nums}
.mp .foot button{background:none;border:1px solid var(--rule);border-radius:8px;height:36px;padding:0 12px;
  color:var(--ink-2);font-size:12.5px;cursor:pointer}
.mp .foot button:disabled{opacity:.3;cursor:default}
.mp .foot button:not(:disabled):hover{background:var(--hover);color:var(--ink-1)}

.mp .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 18px 16px;margin-bottom:14px}
.mp .card--todo{border-left:2px solid var(--amber)}
.mp .card h2{margin:0;font-size:12px;font-weight:600;letter-spacing:.07em;color:var(--ink-3)}
.mp .ratio{display:flex;align-items:baseline;gap:8px;margin:10px 0 0;font-variant-numeric:tabular-nums}
.mp .ratio b{font-size:30px;font-weight:600;color:var(--ink-1);line-height:1.1}
.mp .ratio span{font-size:14px;color:var(--ink-3)}
.mp .track{position:relative;height:6px;border-radius:3px;background:#0f1425;box-shadow:inset 0 0 0 1px var(--rule);
  margin:12px 0 0;overflow:hidden}
.mp .track i{position:absolute;left:0;top:0;bottom:0;width:var(--p,0%);min-width:3px;background:var(--amber);border-radius:3px}
.mp .card p{margin:11px 0 0;font-size:13px;color:var(--ink-2);line-height:1.6}
.mp .card p.mute{color:var(--ink-3);font-size:12.5px}
.mp .fields{margin:10px 0 0;padding:0;list-style:none;font-size:12.5px;color:var(--ink-3)}
.mp .fields li{display:flex;align-items:center;gap:7px;padding:3px 0}
.mp .fields li svg{flex:none;color:var(--ctl)}
.mp .legend{display:flex;align-items:center;gap:7px;margin-top:12px;font-size:12.5px;color:var(--ink-3)}
.mp .legend svg{flex:none;color:var(--green)}
.mp .card--dupe{border-left:2px solid var(--amber)}
/* ปุ่มในแถบขวา — ขอบใช้ --ctl (3.6:1) ไม่ใช่ --rule (1.37:1)
   ขอบเขตของปุ่มต้องผ่าน 3:1 เหมือนกราฟิกอื่น ไม่งั้นอ่านเป็นข้อความธรรมดา */
.mp .cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;height:44px;margin-top:14px;
  border:1px solid var(--ctl);border-radius:9px;background:#1a2136;color:var(--ink-1);font-size:13.5px;font-weight:600;cursor:pointer}
.mp .cta:hover{background:#202942;border-color:var(--green)}

.mp .empty{padding:56px 16px;text-align:center}
.mp .empty p{margin:0;font-size:14px;color:var(--ink-2)}
.mp .empty button{margin-top:10px;background:none;border:0;color:var(--green);font-size:14px;font-weight:600;cursor:pointer;height:44px}

@media (max-width:1040px){
  .mp .cols{flex-direction:column;align-items:stretch;gap:22px}
  .mp .main{width:100%}
  .mp .rail{position:static;flex:none;width:100%;display:grid;grid-template-columns:1fr 1fr;gap:14px;order:-1;align-items:start}
  .mp .card{margin-bottom:0}
}
@media (max-width:640px){
  .mp{--lead:0px;--num:62px;--gutter:62px;--pad:10px}
  .mp .rail{grid-template-columns:1fr;gap:10px}
  .mp .card{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;padding:12px 14px;border-radius:12px}
  .mp .card h2{grid-column:1;grid-row:1}
  .mp .rail .mute,.mp .rail .fields,.mp .rail .legend,.mp .rail .track{display:none}
  .mp .ratio{grid-column:1;grid-row:2;margin:3px 0 0}
  .mp .ratio b{font-size:22px}
  .mp .ratio span{font-size:12.5px}
  .mp .panel{padding:0 12px 12px;border-radius:12px}
  .mp .gh{margin:0 -12px;padding:20px 12px 6px calc(var(--gutter) + 12px)}
  .mp .row{margin:0 -10px;padding:11px var(--pad);min-height:64px;contain-intrinsic-size:auto 74px}
  .mp .lead{display:none}
  .mp.sel-mode{--lead:38px;--gutter:100px}
  .mp.sel-mode .lead{display:flex;margin-left:-4px}
  .mp .num{padding-right:12px}
  .mp .t1{font-size:19px}
  .mp .t2{font-size:17px}
  .mp .t3{font-size:15px}
  .mp .kd{font-size:15px}
  .mp .name{white-space:normal;font-size:15.5px}
  .mp .meta{white-space:normal;font-size:12px}
  .mp .foot{padding-left:calc(var(--gutter) + 12px)}
}
@media (prefers-reduced-motion:reduce){.mp *{transition:none !important}}
`}</style>
  )
}
