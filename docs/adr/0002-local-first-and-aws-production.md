# ADR-0002: Local-first และ AWS Singapore เป็น production target

- Status: accepted
- Date: 2026-10-19
- Source: T3, T7=A, C6=confirmed, T8=confirmed และคำสั่งผู้ใช้ให้พัฒนา local ก่อน
- Related: [ADR-0001](0001-application-and-shared-data.md)

## Context

ผู้ใช้เลือก AWS สิงคโปร์ ต้องการให้เว็บใช้ทรัพยากรต่ำเมื่อว่างและเพิ่มจำนวนเครื่องตามโหลด
พร้อมกำหนดชัดว่าระหว่างพัฒนาให้ใช้ local ส่วน deployment และการทดสอบ scaling ไว้ช่วงท้าย

## Decision

- Production target: AWS Singapore (`ap-southeast-1`)
- รัน standalone web container บน Amazon ECS Fargate ผ่าน Application Load Balancer
- เก็บขั้นต่ำ 1 web task/instance ขนาดเล็กเมื่อว่าง และเพิ่ม/ลดจำนวนอัตโนมัติตามโหลด
- เลือกขนาดต่ำสุดที่ผ่านการทดสอบแอปจริง ไม่สรุปว่า platform minimum เพียงพอก่อนทดสอบ
- ฐานข้อมูลกลางแยกจากเว็บ ใช้ Amazon RDS for PostgreSQL
- พัฒนา/รันบน local ก่อน; ไม่ provision AWS, deploy หรือทดสอบ cloud scaling ในช่วงเริ่มต้น
- การตรวจฟังก์ชันและ integration ที่ทำบน local ไม่ถูกเลื่อนไปช่วง deployment ด้วย

## Consequences and unresolved configuration

ยังไม่กำหนด task/database size, จำนวน task สูงสุด, scaling thresholds, topology,
งบรายเดือน หรือเกณฑ์ทดสอบโหลด การมีเว็บขั้นต่ำหนึ่ง task ยังไม่ใช่ SLA availability
และยังมีค่าใช้จ่ายบริการประกอบขณะไม่มีผู้ใช้
การสร้าง infrastructure และเลือกคำสั่ง deployment เป็นงานปลายทางที่ต้องมีขอบเขตเฉพาะ

Render เป็นข้อเสนอเดิมที่ผู้ใช้เปลี่ยนเป็น AWS ไม่ใช่ deployment target ที่อนุมัติแล้ว

## Research references

- [ECS service auto scaling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-auto-scaling.html)
- [Fargate task resource combinations](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-tasks-services.html)
- [RDS for PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- [ALB pricing model](https://aws.amazon.com/elasticloadbalancing/pricing/)
