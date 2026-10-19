# TICKET — Workflow

เริ่มอ่าน [AGENTS.md](../AGENTS.md) แล้วอ่านเฉพาะแหล่งข้อมูลที่สัมพันธ์กับงาน
โปรเจกต์นี้เริ่มจากข้อตกลง grill-workflow และ grill-design; design discovery เสร็จแล้ว
สถานะ setup และ Verification Policy ดู [CONTEXT.md](../CONTEXT.md)

## Source ownership

| เนื้อหา | แหล่งหลัก |
| --- | --- |
| Product intent, scope, constraints และ UI design | [requirement.md](requirement.md) |
| คำศัพท์ ความสัมพันธ์ กฎธุรกิจ และ verification policy | [CONTEXT.md](../CONTEXT.md) |
| เทคโนโลยีและสถาปัตยกรรมที่ยืนยัน | [ADRs](adr/0001-application-and-shared-data.md) |
| พฤติกรรม feature และ acceptance criteria | `docs/specs/SPEC-###-<feature>.md` เมื่อสร้างจริง |
| งาน implementation และหลักฐานของงาน | `docs/tasks/TASK-###-<slice>.md` เมื่อสร้างจริง |
| Working rules และคำสั่ง repository | [AGENTS.md](../AGENTS.md) |
| Visual evidence | `docs/assets/prototype/` เมื่อมี prototype จริง |

อ้างอิงการตัดสินใจแทนการคัดลอกเหตุผลหลายเอกสาร ห้ามแก้ requirement/spec
เพียงเพื่อให้ตรงกับโค้ดปัจจุบัน; การเปลี่ยนขอบเขตต้องแก้แหล่งหลักของเรื่องนั้น

## Workflow contract

```text
requirement
    ├─ optional prototype → edit-prototype* → spec reconciliation
    └─ spec
    ↓
task
    ↓
implementation
    ↓
review evidence
```

- แต่ละ downstream skill เริ่มเมื่อผู้ใช้เรียก ไม่ได้เริ่มอัตโนมัติจากคำแนะนำขั้นถัดไป
- หากเลือก visual validation ใช้ to-prototype; เมื่อยอมรับภาพแล้วต้องใช้ spec-with-prototype ก่อน to-tasks
- Prototype เป็นหลักฐานภาพ ไม่แทน requirements, domain rules หรือ ADRs
- ถ้าไม่ได้ร้องขอ visual validation และ requirement พร้อม ใช้ write-spec
- Spec ที่มีคำถามสำคัญซึ่งบล็อกพฤติกรรมยังไม่พร้อม implementation
- ไม่สร้างงานหรือเอกสารอนาคตที่ว่างเปล่า Task ต้องมีบริบทพอให้ทำต่อในแชตใหม่ได้
- พัฒนา/ตรวจฟังก์ชันบน local ก่อน ตาม [ADR-0002](adr/0002-local-first-and-aws-production.md); deployment และ scaling verification อยู่ท้ายงาน
- เลือกการตรวจสอบตาม policy ที่ยืนยันใน CONTEXT.md; ไม่ใส่ข้อยกเว้นราย task ลง policy กลาง

## Task states

```text
todo → in_progress → in_review → done
```

ใช้ `blocked` เมื่อทำต่อไม่ได้ โดยระบุ blocker, เหตุผล และเงื่อนไขปลดบล็อก
ไม่ถือว่าทำเสร็จเพียงเพราะโค้ดมีอยู่ ต้องมีหลักฐานตามข้อกำหนดและนโยบายตรวจสอบ
การเลือกไม่เรียก review อัตโนมัติตาม policy ในอนาคตไม่ใช่หลักฐานว่าได้ review แล้ว

## Change discipline

รักษาการเปลี่ยนแปลงที่ไม่เกี่ยวข้อง เตรียมงานให้ตรวจได้ และไม่ commit/push อัตโนมัติ
จนกว่าผู้ใช้หรือนโยบายที่ยืนยันจะระบุเป็นอย่างอื่น
