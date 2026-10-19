# TASK-013: reservation หมดเวลาแล้วคืนโควตาโดยไม่ต่ออายุได้

- Status: todo
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

ลูกค้าเห็นเวลาคงเหลือจริงและระบบคืนโควตาครั้งเดียวเมื่อครบ 15 นาทีโดยยังไม่ยืนยันชำระ รวมการกลับมาซื้อใหม่หลังหมดอายุ

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#user-flow-and-behavior), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md)

## Blocked by

- TASK-012 — [ลูกค้ายืนยันจำนวนแล้วกันบัตรครบทุกประเภทได้](TASK-012-reserve-tickets.md)

## Todo

- [ ] ส่งมอบและตรวจ AC-71 ครบตามข้อความและ verification rows ใน SPEC-001; ใช้ criteria เดิม ไม่เพิ่ม/เปลี่ยน product scope
- [ ] ส่วนร่วม AC-70: คง order/deadline เมื่อ refresh; TASK-014 ตรวจ repeated payment/QR creation ไม่ต่อเวลา; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-014 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [ ] ทำ expiry transition/release และ countdown จาก deadline ระบบ; ไม่ถือโควตาต่อเพียงเพราะ provider status ยังไม่ทราบหรือไม่ตอบ
- [ ] refresh/กลับหน้าเดิมใช้ reference/deadline เดิม; การซื้อใหม่ตรวจ quote/stock/สิทธิ์ใหม่ ไม่คืนชีพ order เก่าและยังติดตาม payment เก่าได้
- [ ] ออกแบบกลไกทำงานครบโดยไม่พึ่ง timer/memory ของ web process เดียว; ไม่เพิ่ม infrastructure ใหม่ที่ ADR ไม่ได้เลือก
- [ ] Verification — Unit controlled clock และ PostgreSQL integration: ก่อน/ตรง/หลัง deadline, release ซ้ำ, restart และ concurrent expiry/reservation ไม่ทำให้ quota เกิน
- [ ] Verification — E2E: countdown/refresh/expired state และเริ่ม order ใหม่; payment unknown fixture ไม่ทำให้ hold เกิน 15 นาที
- [ ] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [ ] ใช้คำสั่ง dev/build/lint/typecheck/test ที่ TASK-001 บันทึกและ repository ปัจจุบันรองรับ เลือกรัน checks ที่เกี่ยวข้องกับการเปลี่ยนแปลงจริง; บันทึก evidence ใน Todo นี้โดยไม่แต่งคำสั่ง/ผลผ่าน และคง local-first
- [ ] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [ ] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow
