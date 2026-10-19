# TICKET

แอป Next.js/TypeScript สำหรับเว็บไซต์ขายบัตรคอนเสิร์ต พัฒนา local ก่อนตาม [ADR-0002](docs/adr/0002-local-first-and-aws-production.md)
ขอบเขตปัจจุบันคือ [TASK-001](docs/tasks/TASK-001-local-foundation.md): shell และเครื่องมือพัฒนา ยังไม่มีการขายบัตรจริง

## เริ่มพัฒนา

ใช้ Node.js ตาม `.nvmrc` (24.20.0), npm 12.0.2 และ Docker พร้อม Compose

```sh
npm ci --ignore-scripts
cp .env.example .env.local
npm run auth:local
npm run db:up
npm run db:migrate
npm run db:check
npm run dev
```

เปิด http://127.0.0.1:3000 หรือ `/login` สำหรับหลังบ้าน ตัวแอปไม่มีการติดต่อผู้ให้บริการภายนอกในขั้นนี้
Kanit ถูก bundle จาก `@fontsource/kanit` ไม่ต้องเชื่อม Google Fonts ตอน build/เปิดหน้า

## ฐานข้อมูล local

Compose project `ticket-local` ใช้ PostgreSQL 18.6: `db` ที่ loopback:55432 ฐาน `ticket_dev`
เก็บข้อมูลใน volume `dev-data`; `db-test` ที่ loopback:55433 ฐาน `ticket_test` ใช้ tmpfs และไม่เก็บข้อมูลหลังหยุด container
ค่ารหัสผ่านใน compose เป็นค่า local เท่านั้น ห้ามนำไปใช้ production

`npm run db:stop` หยุดทั้งสองฐาน; `npm run db:down` ถอด container/network โดยยังเก็บ dev volume
ไม่มีคำสั่งล้าง dev volume อัตโนมัติ และ test ไม่ใช้ `DATABASE_URL` ของแอป
Integration test ใช้ `TEST_DATABASE_URL` จาก `.env.test.local` ถ้ามี (ตัวอย่าง `.env.test.example`)
ยอมรับเฉพาะ loopback/ฐาน `ticket_test` ไม่มี URL options และสร้าง/ลบ schema เฉพาะรอบทดสอบด้วยชื่อสุ่ม
TASK-002 เพิ่ม auth schema เท่านั้น ยังไม่มี schema สำหรับวงจรบัตร

ใช้ `createDatabasePool` และ `inTransaction` ใน `src/server/database.ts` เป็น data-access boundary
transaction ต้องใช้ client ที่ส่งให้ callback เดียวกันทุก statement ไม่ใช้ `pool.query` สลับ connection
ไม่มี in-memory critical store; ยังไม่ใช่หลักฐานปิด AC-105 ซึ่งต้องตรวจพฤติกรรม domain หลาย instance ใน TASK-037

## ตรวจงาน

```sh
npm run typecheck
npm run lint
npm run build
npm run test:unit
npm run test:integration
npm run browser:install
npm run test:e2e
```

Vitest แยก unit/integration ด้วย config คนละไฟล์ ไม่มี pass เมื่อไม่มี test
Playwright ใช้ Chromium ใน `.cache/ms-playwright`, เปิด Next dev ของตัวเองที่ 127.0.0.1:3100
ผ่าน `tests/support/start-e2e-server.ts` ซึ่งสร้าง auth schema ชื่อสุ่มและบัญชี fixture ใน `ticket_test`
ส่ง database URL/secret ของ fixture ให้เฉพาะ process ทดสอบ และลบ schema เมื่อ server หยุดอย่างปกติ
ไม่ใช้ owner หรือ credentials ของ dev จริง; หาก process ถูก kill แบบบังคับ อาจเหลือเฉพาะ schema test ชื่อ `e2e_<random>` ให้ตรวจและลบเฉพาะของรอบนั้น
ทดสอบ desktop 1440×900 และ Pixel 7; ไม่ reuse server อื่น และไม่ retry กลบความล้มเหลว
หากเครื่องขาด system libraries สำหรับ Chromium ให้ติดตั้งผ่านวิธีที่เหมาะกับเครื่องก่อนรัน ไม่ข้าม E2E gate
ผล browser อยู่ `test-results/` (รวมภาพ shell); รายงาน gate ที่ยืนยันแล้วอยู่ใน task

`tests/support/scripted-provider.ts` เป็น double แบบควบคุมผลทีละคำขอสำหรับขอบเขต Omise/Resend/R2
ใช้เฉพาะ tests, บันทึก request และจำลอง success/failure ได้ ไม่ส่ง HTTP/อีเมล/เงินจริง/ไฟล์ production
ไม่ได้รับรอง provider contract และไม่ได้เลือก provider ใหม่ งาน integration จริงอยู่ task ถัดไป

## Build

`npm run build` ตั้ง `output: standalone` และคัดลอก `.next/static` เข้าชุด standalone
ด้วย `scripts/prepare-standalone.mjs`; `npm start` เปิด standalone server บน loopback ใช้ตรวจ build แบบ local เท่านั้น
ยังไม่มี cloud deployment หรือ scaling/load test จาก foundation นี้
ข้อมูล architecture, requirement, spec และ task dependencies ดู [AGENTS.md](AGENTS.md)

เลือก `pg` เพื่อใช้ SQL/transaction โดยตรงโดยไม่เพิ่ม ORM, Vitest สำหรับ unit/DB integration,
Playwright สำหรับ browser และ Biome สำหรับ lint (ไม่เพิ่มชุด ESLint ที่มี dependency/peer constraints ไม่สอดคล้อง)
เวอร์ชันตรงทั้งหมดอยู่ `package.json` และ `package-lock.json` ส่วนคำสั่งที่ผ่านจริงบันทึกใน AGENTS/task

## บัญชีหลังบ้าน (TASK-002)

ใช้ Better Auth 1.7.11 แบบ email/password กับ PostgreSQL เดิม ไม่มี auth service เพิ่ม
`npm run auth:local` สร้าง random secret ลง `.env.local` สิทธิ์ไฟล์ 0600 โดยรักษา secret เดิม
`BETTER_AUTH_URL` ต้องเป็น origin ของเว็บ; HTTP อนุญาตเฉพาะ loopback ส่วน HTTPS ใช้ Secure cookie
ไม่มี production secret/default owner/password ที่ฝังในโค้ด

`npm run db:migrate` เป็นคำสั่งภายในที่ใช้ schema planner ของ Better Auth เวอร์ชันที่ pin ไว้
สร้าง/เติม `auth_user`, `auth_account`, `auth_session`, `auth_verification`, `auth_rate_limit` บนฐานตาม `.env.local`
รันซ้ำได้และใช้ PostgreSQL advisory lock กัน migration ซ้อนกัน เว็บไม่รัน migration เอง
คำสั่งนี้อยู่ในขั้นพัฒนา local; การเลือก migration rollout/rollback สำหรับ production อยู่ช่วงเตรียม deployment

สร้าง owner คนแรกโดยตั้ง JSON ที่มี `name`, `email`, `password` ในไฟล์ private เช่น `.local/owner.json`
ด้วย editor ของคุณ ใช้รหัสผ่านที่ตั้งเอง 15–128 ตัวอักษร ไม่ส่งรหัสผ่านผ่าน chat/argv หรือ commit ไฟล์นี้

```sh
mkdir -p .local
chmod 700 .local
# สร้าง .local/owner.json ด้วย editor ก่อนขั้นถัดไป
chmod 600 .local/owner.json
npm run owner:bootstrap < .local/owner.json
```

CLI ไม่พิมพ์ค่ารหัสผ่านหรือข้อมูลบัญชี ถ้ามี owner แล้วจะปฏิเสธและไม่เปลี่ยนบัญชี/รหัสผ่านเดิม
การสร้าง user และ credential account อยู่ transaction เดียวภายใต้ advisory lock
ไม่มี signup/bootstrap ผ่าน HTTP และไม่มี public organizer/scanner provisioning ใน TASK-002
บัญชี organizer/scanner ที่อยู่ใน tests เป็น fixtures เท่านั้น; คำเชิญ/การเพิ่มทีมจริงเป็น task ถัดไป

เข้า `/login` แล้วระบบนำไป `/back-office/owner`, `/back-office/organizer` หรือ `/back-office/scanner`
ตาม role ที่อ่านจากฐานข้อมูล ไม่รับ role จากผู้ใช้; หน้าผิดบทบาทไม่ส่งข้อมูลและแสดง not found/ไม่มีสิทธิ์
เก็บ session ใน PostgreSQL, HttpOnly/SameSite=Lax cookie, ไม่ cache role ใน cookie
เลือกอายุ session หลังบ้านสูงสุด 8 ชั่วโมงแบบไม่ต่ออัตโนมัติ และขั้นต่ำรหัสผ่าน 15 ตัวอักษรเป็นรายละเอียด implementation
ภายใน NQ-03/NQ-06 ไม่ใช่ตัวเลขที่ผู้ใช้ตอบเพิ่ม และไม่เปลี่ยนพารามิเตอร์ OTP/invite/reset ที่ตกลงแล้ว
logout ยกเลิก session ใน store ด้วย; cache headers ของ auth HTTP เป็น no-store
rate limit ใช้ database storage (รวม sign-in rule ของ library 3 ครั้ง/10 วินาทีต่อ client IP)
proxy/header trust และการตั้งค่าป้องกัน abuse ที่ deployment จริงต้องตรวจใน target environment ช่วงท้าย

`canAccessResource` เป็น guard ของ actor/object scope สำหรับต่อยอด: owner-only proof, organizer เฉพาะงานตน,
scanner เฉพาะ event ที่มอบหมายและไม่ให้ order/report/proof ไม่ใช่การส่งมอบ endpoint/domain data เหล่านี้
task เจ้าของข้อมูลต้องอ่าน scope จาก store และจำกัด fields ตาม role ก่อนตอบกลับ ไม่เชื่อ ownership IDs จาก request
TASK-003 จะเติม password reset; ตอนนี้ไม่มี reset link ที่กดแล้วใช้งานไม่ได้

เอกสารประกอบการเลือก: [Next.js standalone](https://nextjs.org/docs/app/api-reference/config/next-config-js/output),
[node-postgres transactions](https://node-postgres.com/features/transactions), [Vitest](https://vitest.dev/guide/),
[Playwright](https://playwright.dev/docs/intro), [Biome](https://biomejs.dev/installation/quick-start/)
และ [Better Auth PostgreSQL](https://better-auth.com/docs/adapters/postgresql),
[Better Auth database/migration](https://better-auth.com/docs/concepts/database)
