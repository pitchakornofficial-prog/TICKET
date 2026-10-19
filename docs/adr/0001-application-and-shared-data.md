# ADR-0001: Next.js, TypeScript และ PostgreSQL กลาง

- Status: accepted
- Date: 2026-10-19
- Source: ผู้ใช้ยืนยัน T2 ใน grill-workflow
- Related: [requirements](../requirement.md), [domain](../../CONTEXT.md)

## Context

เว็บมีหน้าลูกค้า หลังบ้าน และการจอง/ชำระเงิน โดยต้องรองรับหลายเครื่องเว็บ
เป้าหมายเบื้องต้นคือผู้ใช้พร้อมกันประมาณ 200 คน แต่ยังไม่มีผลทดสอบจริง
ผู้ใช้ยืนยันข้อเสนอให้รวมเว็บและ server-side functionality ในโปรเจกต์แอปเดียว
และแยกข้อมูลสำคัญไว้ในฐานข้อมูลกลาง

## Decision

- ใช้ Next.js + TypeScript สำหรับ application project เดียว
- ใช้ PostgreSQL เป็น shared transactional store สำหรับข้อมูลบัตรและคำสั่งซื้อ
- ทุก instance ต้องอ้างอิงข้อมูลกลาง ไม่ใช้ข้อมูลในหน่วยความจำ/แคชเฉพาะเครื่องตัดสินยอดบัตรหรือคำสั่งซื้อ
- เป้าหมาย packaging คือ Next.js standalone ตามข้อตกลง AWS; ยังไม่มี runtime หรือ framework version ที่เลือกจริง

## Consequences and limits

ต้องระบุธุรกรรม inventory, callback ซ้ำ และการประสานข้อมูลใน spec แล้วตรวจสอบ implementation
การเลือกฐานข้อมูลไม่ใช่หลักฐานว่าป้องกันการขายเกินจำนวนหรือรองรับโหลดได้แล้ว
ยังไม่เลือก ORM, package manager, schema, test runner หรือกลยุทธ์ cache รายหน้า

## Research references

เอกสารที่ใช้ประกอบข้อเสนอในบทสนทนา ไม่ใช่คำสั่งให้ติดตั้งหรือ deploy:

- [Next.js self-hosting and multi-instance coordination](https://nextjs.org/docs/app/guides/self-hosting)
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)
