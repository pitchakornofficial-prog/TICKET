# TICKET — Agent Guide

## Project navigation

เริ่มอ่านไฟล์นี้ แล้วเปิดเฉพาะเอกสารที่เกี่ยวข้องกับงานปัจจุบัน:

- [Product requirements and UI design](docs/requirement.md)
- [Domain context and setup status](CONTEXT.md)
- [Workflow and source ownership](docs/workflow.md)
- [Application and shared data](docs/adr/0001-application-and-shared-data.md)
- [AWS production target and local-first development](docs/adr/0002-local-first-and-aws-production.md)
- [Payment, email, and storage integrations](docs/adr/0003-external-integrations.md)
- [Invitation and back-office login](docs/adr/0004-invitation-and-back-office-login.md)
- [SPEC-001: Concert ticket lifecycle (ready)](docs/specs/SPEC-001-concert-ticket-lifecycle.md)
- [SPEC-001 task plan and acceptance coverage](docs/tasks/README.md)

เมื่อมี artifact จริง ให้ใช้ `docs/specs/SPEC-###-<feature>.md`,
`docs/tasks/TASK-###-<slice>.md` และ `docs/assets/prototype/` ตาม workflow
โดยไม่สร้างโฟลเดอร์หรือเอกสารเปล่าล่วงหน้า

## Working rules

- รักษาข้อตกลงที่ยืนยันแล้ว และแยกข้อเสนอ/ข้อสงสัยออกจากข้อกำหนด
- อ้างอิงแหล่งข้อมูลหลักตาม [workflow](docs/workflow.md) แทนการทำสำเนาข้อตกลงหลายแห่ง
- พัฒนาและรันบน local ก่อน เก็บ deployment และการทดสอบ scaling ไว้ช่วงท้ายตามขอบเขตงานที่ยืนยัน ไม่เลื่อนการตรวจสอบฟังก์ชันบน local ไปด้วย
- อ่าน Verification Policy ใน `CONTEXT.md` ก่อนเลือกวิธีตรวจสอบ implementation; ถ้ายังไม่มีนโยบายที่ยืนยันแล้ว อย่าสมมติโหมด
- รักษางานที่ไม่เกี่ยวข้องให้เหมือนเดิม ไม่ commit หรือ push อัตโนมัติ เว้นแต่ผู้ใช้หรือนโยบายโปรเจกต์ระบุ
- ไม่เปลี่ยนแปลงไฟล์สกิลเพื่อทำให้งานโปรเจกต์ผ่าน และไม่ติดตั้ง/เรียกบริการ cloud เพื่อสำรวจคำสั่ง

## Repository commands

ตรวจ TASK-001 เมื่อ 2026-10-20: Node.js 24.20.0 (`.nvmrc`), npm 12.0.2,
Next.js 16.4.2 / React 19.3.1 / TypeScript 6.0.3, data access ใช้ `pg` 8.23.1 โดยตรง
ไม่เพิ่ม ORM; exact dependencies และ lockfile อยู่ `package.json`/`package-lock.json`

- `npm ci --ignore-scripts` — ติดตั้งตาม lockfile โดยไม่เรียก lifecycle scripts
- `npm run db:up` — เปิด PostgreSQL 18.6 แยก dev/test ผ่าน local Compose; ตรวจแล้ว healthy ทั้งคู่
- `npm run db:check` — ตรวจเชื่อม dev PostgreSQL (ต้องคัดลอก `.env.example` เป็น `.env.local`); ผ่านแล้ว
- `npm run db:stop` / `npm run db:down` — lifecycle ตาม compose; down ไม่ลบ dev volume
- `npm run dev` — Next local ที่ 127.0.0.1:3000; ตรวจ browser แล้ว
- `npm run build` — standalone packaging พร้อมคัดลอก static assets; ผ่านแล้ว (ยังไม่ deploy)
- `npm start` — เปิด standalone build แบบ local บน loopback; ตรวจ HTTP 200 และภาพแล้ว
- `npm run typecheck` — Next route type generation + TypeScript; ผ่านแล้ว
- `npm run lint` — Biome 2.5.15; ผ่านแล้ว
- `npm run test:unit` — Vitest 5.0.5, `tests/unit/**/*.test.ts`, `vitest.unit.config.ts`; TASK-001 ผ่าน 10 tests
- `npm run test:integration` — Vitest 5.0.5, `tests/integration/**/*.test.ts`, PostgreSQL จริงที่ `ticket_test`; TASK-001 ผ่าน 2 tests
- `npm run browser:install` — Playwright Chromium ลง `.cache/ms-playwright`; ติดตั้งแล้ว
- `npm run test:e2e` — Playwright 1.64.1 เปิด dev server ของตัวเองที่ loopback:3100,
  desktop Chromium/Pixel 7; TASK-001 ผ่าน 2 tests; ผลและข้อจำกัดให้ดู task ไม่ถือว่ามี runner เท่ากับผ่าน

รายละเอียด local/test isolation และ provider doubles ดู [README](README.md)
การรันใน agent sandbox อาจต้องขอสิทธิ์ใช้ loopback/Docker/subprocess;
TASK-001 เคยพบ db:check เชื่อมไม่ได้และ build อ่าน TypeScript CLI output ไม่ได้ใน sandbox,
คำสั่งเดิมผ่านเมื่อใช้สิทธิ์ที่จำเป็น ไม่ได้ลดการตรวจ type/build

`skills-lock.json` เป็นข้อมูลเครื่องมือสกิล ไม่ใช่ application dependency manifest
การตรวจ `git status` ล่าสุดยังไม่พบ Git repository ที่ใช้งานได้;
อย่าอ้างว่ามี branch/commit หรือเริ่ม Git workflow โดยไม่มีหลักฐาน
