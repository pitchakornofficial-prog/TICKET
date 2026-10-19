# TASK-001: เปิดแอป TICKET และตรวจสอบการพัฒนาบน local ได้

- Status: done
- Spec: [SPEC-001](../specs/SPEC-001-concert-ticket-lifecycle.md)

## Goal

แอป Next.js/TypeScript รันบน local ใช้ PostgreSQL กลาง และมีเครื่องมือตรวจที่จำเป็นพร้อมใช้งานสำหรับงานถัดไป โดยแสดง shell เริ่มต้นตามข้อกำหนด TICKET

อ้างอิง [สัญญาพฤติกรรม](../specs/SPEC-001-concert-ticket-lifecycle.md#non-functional-requirements), [Verification Policy](../../CONTEXT.md#verification-policy), [AGENTS](../../AGENTS.md), [ADR-0001](../adr/0001-application-and-shared-data.md), [ADR-0002](../adr/0002-local-first-and-aws-production.md), [ADR-0003](../adr/0003-external-integrations.md)

## Blocked by

- None

## Todo

- [x] ส่งมอบ prerequisite/ส่วนสมทบของ AC-105 ตามขอบเขตด้านล่าง ไม่อ้างว่า criteria ของงานที่ร่วมกันครบจาก task นี้เพียงงานเดียว
- [x] ส่วนร่วม AC-105: วาง shared persistence/transaction และ test boundary; TASK-037 ตรวจพฤติกรรมหลาย web instances ให้ครบ; criteria นี้ครบเมื่อส่วนที่ระบุใน TASK-037 เสร็จร่วมกัน ไม่ใช้ test fixture อ้างว่าส่งมอบอีก task แล้ว
- [x] เลือก runtime/package manager/framework versions, ORM หรือ data-access และ unit/integration/E2E runner ตาม NQ-03 ภายใน ADR-0001; บันทึกสิ่งที่เลือกและคำสั่งจริงใน AGENTS.md หลังตรวจว่าใช้ได้ ไม่เดาคำสั่งจาก framework
- [x] จัด local application/test configuration, PostgreSQL lifecycle และข้อมูลทดสอบที่แยกจากข้อมูลจริง; พิสูจน์ว่าคนละ connection อ่านข้อมูลกลางที่เขียนสำเร็จได้ ไม่ใช้ in-memory store แทนฐานข้อมูลของ critical state
- [x] เตรียม test transport/provider doubles ที่งาน local ใช้ได้โดยไม่ใช้ production credentials และโดยไม่เปลี่ยน Omise/Resend/R2 ที่ตกลง; ยังไม่สร้าง integration ที่อยู่นอก goal
- [x] วาง shell ที่นำกลับใช้ได้ตาม D-01/D-05/D-11–D-14 และ G-47; เลือก tokens ภายใน constraint โดยไม่ยกระดับ preference เป็นข้อบังคับ และไม่สร้างหน้า prototype หรือ feature จำลองที่อ้างว่าซื้อได้แล้ว
- [x] Verification — ตรวจ dev/build/typecheck/lint ด้วยคำสั่งที่ configuration จริงรองรับ และพิสูจน์ unit runner, integration runner ที่เชื่อม PostgreSQL จริง และ E2E runner ที่เปิดแอป local ได้; ห้ามถือว่า runner ว่างที่ไม่ตรวจอะไรเป็นหลักฐาน
- [x] Verification — บันทึกการรัน/ผลของ shared-store roundtrip และ E2E shell ภาษาไทยที่ใช้ Kanit/ชื่อ TICKET; ข้อนี้ยังไม่ปิด AC-105 ของหลาย instance และไม่อ้างว่า AC ด้านภาพครบทุกหน้าที่อนาคตยังไม่มี
- [x] ใช้ Verification Policy ใน CONTEXT: unit-test/integration-test/e2e-test/code-review เป็น required เมื่อเกี่ยวข้อง; รันวิธีตรวจที่ระบุและบันทึก commands/results จริง หากเกี่ยวข้องแต่ไม่มี runner/tool หรือไม่ผ่านให้บล็อกพร้อมเงื่อนไขปลดบล็อก ห้ามลดเป็น auto/off หรือใช้ manual check แทน automated critical journey
- [x] นำ focused change และ evidence เข้า code-review ที่เกี่ยวข้องตาม policy และแก้ finding ก่อนถือว่างานจบ; การสร้าง task หรือมีโค้ดอย่างเดียวไม่ใช่ผล review ผ่าน
- [x] หากผู้ใช้หรือนโยบายที่มีผลกำหนดให้ commit ให้ commit เฉพาะการเปลี่ยนแปลงของ task นี้ มิฉะนั้นเตรียม focused diff สำหรับ review; ไม่ init Git/commit/push อัตโนมัติ และต้องตรวจว่ามี Git repository ใช้งานได้ก่อนทำ Git workflow

- [x] Verification selection (2026-10-20): policy จาก CONTEXT ทั้ง 4 capability required, ไม่มี task override; เลือก unit-test สำหรับ locale/test-target validation และ scripted doubles, integration-test สำหรับ PostgreSQL/transaction boundary, e2e-test สำหรับ browser shell; code-review required รอหลัง in_review
- [x] Runner resolution: skill canonical `.agents/skills/unit-test/SKILL.md`, `integration-test/SKILL.md`, `e2e-test/SKILL.md`, `code-review/SKILL.md` อย่างละหนึ่ง; manifests/config เลือก Vitest unit/integration และ Playwright E2E ชัดเจนตาม AGENTS ไม่ใช้ runner substitute

- [x] unit-test terminal report (sequential sub-agent `verify_unit`, 2026-10-20): `npm run test:unit`, Vitest 5.0.5, exit 0, 1 file/10 tests ผ่าน; Thai THB/Bangkok boundary, unsafe test DB targets, provider success/failure/fail-closed/request snapshots; ไม่มี changed test files/ownership violation, ไม่ตรวจ provider production contract
- [x] integration-test terminal report (sequential sub-agent `verify_integration`, หลัง unit): `npm run test:integration`, Vitest 5.0.5/PostgreSQL 18.6 จริง; sandbox ครั้งแรก setup EPERM loopback:55433 (ไม่ใช่ pass), รันคำสั่งเดิมด้วยสิทธิ์ local connection แล้ว exit 0, 1 file/2 tests ผ่าน; independent backend PIDs, uncommitted invisibility/committed visibility, SQL-error rollback และ connection ใช้ต่อได้; ไม่มี file writes/ownership violation, ลบเฉพาะ schema test ชื่อสุ่ม ไม่รับรองหลาย web instance/domain counters

- [x] e2e-test terminal report (sequential sub-agent `verify_e2e`, หลัง integration): Playwright 1.64.1 `npm run test:e2e`; sandbox ครั้งแรกเปิด configured webServer ไม่ได้และไม่ได้รัน tests, คำสั่งเดิมใช้สิทธิ์ local browser/server ผ่าน 2/2 (5.9s); เสริม test เฉพาะ `tests/e2e/shell.spec.ts` แล้วรันอีกครั้งผ่าน 2/2 (5.7s), retries=0; มี loaded Kanit FontFace และ self-hosted Thai-font HTTP response จริง, branding/Thai/not-selling/icons/no emoji/no overflow/skip link/home navigation/no pageerror ผ่าน ไม่มี writes นอกขอบเขต (generated .next/test-results เป็น runner output)
- [x] Final checks: `npm run typecheck`, `npm run lint` (Biome ตรวจ 21 files ไม่มี warnings), `npm run build` พร้อม standalone static copy exit 0; `npm run db:up` dev/test healthy และ `npm run db:check` exit 0. `npm run dev` เปิดจริงและ browser ตรวจแล้ว; `npm start` standalone loopback:3000 ready, HTTP GET / =200 และ CUA เห็นไทย/Kanit/theme ครบ. Parent ตรวจภาพ desktop 1440×922 และ Pixel 7 screenshot 1082×2202 (device pixel scaling) ไม่มี clipping/overflow ที่พบ; supplementary CUA ตรวจ viewport 393×851 และ desktop ปกติ, คืน viewport override แล้ว
- [x] Scope/evidence: ใหม่ `src/`, `tests/`, `scripts/`, package/lock, TS/Next/Biome/Vitest/Playwright/Compose config, env examples, README; เปลี่ยนเฉพาะคำสั่ง/สถานะบริบทใน AGENTS/CONTEXT และ TASK-001. ไม่มี Git repository ใช้งานได้ (`git status` fatal), จึงส่ง explicit file target ของ foundation ใหม่และ documentation delta ให้ review ไม่มี init/commit/push. ไม่แก้ requirement/spec/ADRs/skills/task อื่น
- [x] ข้อจำกัดคงไว้: browser ตรวจ Chromium desktop กับ mobile emulation เท่านั้น, ไม่มี physical camera/device coverage, provider doubles ไม่รับรอง Omise/Resend/R2 จริง, ยังไม่มี domain flows/CI/cloud deployment/load/scaling หรือหลาย web instance; AC-105 ส่งมอบเฉพาะ shared persistence/transaction prerequisite ต้องร่วม TASK-037 ก่อนครบ criteria
- [x] Review approved — final sub-agent `final_review`, 2026-10-20; explicit file target ของ TASK-001 (application/config/scripts/tests/README ใหม่ และ AGENTS/CONTEXT/task delta) เทียบกับฐานก่อนงานที่มีเฉพาะเอกสาร/เครื่องมือ ไม่มี Git diff ที่ใช้งานได้. อ่าน task/spec เต็ม ข้อกำหนดดีไซน์ policy/ADRs ที่เกี่ยวข้อง และตรวจ source/config/scripts/tests/lockfile ตรงขอบเขต; ตรวจภาพ desktop/mobile และ Playwright last-run passed ด้วยตนเอง. No findings. หลักฐาน unit 10/integration PostgreSQL จริง 2/E2E 2 tests และ dev/build/typecheck/lint/db-check/standalone HTTP 200 เป็นผลรันก่อน review ที่ตรวจความน่าเชื่อถือร่วมกับ implementation/test assertions แล้ว ไม่ได้รันซ้ำใน review. อนุมัติเฉพาะ foundation และส่วนร่วม AC-105; ไม่ปิด AC-105 เต็มหรือ AC ภาพ/โดเมนของหน้าที่ยังไม่มี และคงข้อจำกัดอุปกรณ์/provider/deployment/scaling ข้างต้น; ไม่แก้ไฟล์อื่นหรือทำ Git workflow
