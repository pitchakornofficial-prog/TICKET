# Deployment — AWS Singapore

## Production rollout 2026-11-04

`ticket.phatysd.me` routes through the existing `ticket-workload-test` load balancer to the `ticket-production` stack. Its account-specific CloudFormation template is [ticket-production.json](../infra/aws/ticket-production.json). The production ECS service uses a separate Neon `production` branch and `/ticket/production/` SSM parameters. The staging service remains running for rollback and continues to incur charges. Do not delete the staging stack while production depends on its load balancer, listener, network, certificate, or ECR repository.

The production owner was bootstrapped from SSM; the bootstrap password parameter remains in SSM. The owner sign-in, public homepage, target health, restricted Stripe key read access, and signed/unsigned webhook checks passed. `pay-test` returns 403 in live mode. The paid purchase E2E suite was run locally with test providers; a live PromptPay payment, Stripe payout readiness, production load capacity, and a Neon backup/restore drill have not been verified. One production task is configured; no production autoscaling policy or AWS Budget alert is configured. Neon Free limits and its short recovery history need review before selling tickets.

Event fee settings currently allow one organizer rate per event and default to zero. Do not open sales for an event requiring different organizer rates per ticket category until the feature and financial reports are updated and verified. Production currently contains no concert configuration from staging.

เป้าหมายตาม [ADR-0002](adr/0002-local-first-and-aws-production.md): ECS Fargate ARM64 + ALB, private RDS PostgreSQL, Cloudflare, SSM SecureString, Resend และ R2; Stripe ตาม [ADR-0003](adr/0003-external-integrations.md).
ชุดนี้เตรียม source/container และคำสั่งปฏิบัติการ ไม่ได้สร้าง AWS resources หรือรับรอง capacity.

## Build artifact

ใช้ Docker ที่รองรับ ARM64 บนเครื่อง build/CI และเก็บ image digest สำหรับ release/rollback:

```sh
docker build --platform linux/arm64 --target runner -t ticket:release .
docker build --platform linux/arm64 --target operations -t ticket:operations .
```

Runtime image รันด้วย user `node`, Node 24.20.0, standalone server บน `0.0.0.0:3000` และมี public/static assets ครบ. ไม่ใช้ `npm start` ที่ตั้ง loopback สำหรับ local. `.dockerignore` ตัด env/secrets, cache, host dependencies และ Git metadata ออกจาก build context. ไม่ส่ง production secrets ตอน build.
Operations image มี source/dependencies สำหรับ explicit migration และ bootstrap; ใช้ release source เดียวกับ web และไม่เปิดเป็น ECS service.

## Configuration

ชื่อค่าทั้งหมดอยู่ใน `deployment.env.example`. ใส่ค่าจริงผ่าน ECS secrets จาก SSM SecureString โดยไม่ commit หรือส่งใน chat. ตั้ง HTTPS origin จริงใน `BETTER_AUTH_URL`, random `BETTER_AUTH_SECRET` อย่างน้อย 32 ตัวอักษร, Stripe Live keys พร้อม signing secret ของ `/api/webhooks/stripe`, Resend key และ `EMAIL_FROM` ที่ verified แล้ว, R2 bucket/credentials/endpoint. คง auth secret เดิมเมื่อ rollout เพื่อรักษา sessions.

ตรวจค่าจาก environment ของ operations task:

```sh
node scripts/check-production-env.mjs
```

Web image ตรวจค่าชุดเดียวกันก่อน start และปฏิเสธ configuration ที่ขาด. ตัวตรวจยืนยันรูปแบบเท่านั้น ไม่พิสูจน์ key/account/domain หรือการเข้าถึง provider. สำหรับ local runtime smoke เท่านั้น สามารถเปิด standalone โดยตรง; ห้ามใช้วิธีข้าม gate นี้บน production.
`EMAIL_FROM` แทน sender ของทุก Resend message; production จะไม่ใช้ local capture เมื่อ key หาย.

## Rollout และข้อมูล

1. ก่อน provision ให้ปิดค่าที่ยังเปิดใน ADR-0002/NQ-04: งบและ estimate, load/latency/error/duration targets, scaling cooldown/pre-scale schedule, connection budget ระหว่าง rollout, RTO/RPO และ restore policy. บันทึกผลจริงก่อนเปิดขาย.
2. เตรียม topology/SG/origin isolation, ACM/Cloudflare Full strict, SSM IAM/KMS, logs retention 14 วัน และ backup retention 7 วันตาม ADR. ALB รับ origin จาก Cloudflare ตามกลไกที่ตรวจแล้ว; app port รับเฉพาะ ALB SG และ DB รับเฉพาะ task SG. ไม่สร้าง NAT เป็น baseline.
3. Snapshot และทดสอบ restore ก่อนเปลี่ยน schema. ใช้ operations task เพียงหนึ่งตัวบน private DB เดียวกับ web โดย override command เป็น `node scripts/migrate-auth.ts`. ไม่ใช้ `npm run db:migrate` ที่อ่าน `.env.local`. Migration ใช้ advisory lock แต่ยังไม่ใช่ versioned reversible migration set; domain modules ยังมี lazy CREATE/ALTER ตอนเรียกใช้งาน ต้องตรวจ schema initialization/สิทธิ์ DDL กับฐานว่างและ clone ก่อน rollout. ห้ามอ้างว่าคำสั่งนี้เตรียม schema ทุกโมดูลครบ.
4. สร้าง owner ด้วย operations image command `node scripts/bootstrap-owner.ts` และ JSON stdin ผ่านช่องทาง private ที่รองรับ. อย่าใส่รหัสผ่านใน task definition/argv/logs. หากไม่มีช่องทาง stdin ที่ปลอดภัย ให้ทำผ่าน controlled operational session; ห้าม seed test organizer/concert ใน production.
5. Deploy web โดย image digest, Linux/ARM64, 0.5 vCPU/1 GiB, min 1/max 4 tasks ตาม ADR. ALB target port 3000, health path `/api/health`, success 200. Endpoint นี้ตรวจ process liveness เท่านั้น ไม่ตรวจ DB/provider.
6. ก่อนส่ง traffic ตรวจ `/api/health`, `/`, `/news`, public assets, DB query ผ่าน `node scripts/db-check.ts` ใน operations task, owner login/logout, guest OTP และอีเมลจริง, R2 public/private access, Stripe signed webhook/replay/late-event/cancel recovery. ยืนยัน `/pay-test` ใช้ไม่ได้ใน Live mode. ตรวจ logs โดยไม่เปิดเผยข้อมูลลูกค้า/OTP/secret.
7. ทดสอบ 2 instances, ARM64 native runtime, pool budget (auth และ shared pools รวม 10 ต่อ web process ในปัจจุบัน), surge/DB max_connections, proxy trust/client IP/rate limits, scaling และ restore. ผล local เดิมไม่แทนหลักฐานนี้. Cloudflare cache เฉพาะ public static และ bypass private/API/webhook; ห้าม challenge webhook.

## Rollback

เก็บ previous task definition + image digest และ backup/restore evidence ก่อน release. หาก smoke ไม่ผ่าน ให้คืน ECS service ไป task definition เดิม แล้วตรวจ health, DB compatibility และ payment webhook recovery อีกครั้ง. ห้าม rollback schema ด้วยการลบตารางหรือ replay payment/ออกบัตรใหม่. หาก schema ไม่ compatible ให้หยุด rollout และใช้แผน forward fix หรือ restore ที่ตกลงไว้; restore อาจสูญเสียธุรกรรมหลัง snapshot จึงต้อง reconcile เงิน/บัตรก่อนเปิด traffic. Secret เปลี่ยนต้อง rollout task ใหม่.

## หลักฐานรอบเตรียม 2026-11-02 (ประวัติ)

Candidate ในรอบเตรียมแรกคือ working tree ก่อนการปรับปรุง E2E specs; บันทึกไว้เป็นประวัติ

| การตรวจ candidate รอบเตรียม | ผล |
| --- | --- |
| `npm run build` / typecheck / lint | ผ่าน; `/news` เป็น dynamic และ build ไม่อ่านข่าวจาก DB อีก |
| `npm run test:unit` | 56 files / 340 tests ผ่าน รวม production config/email tests |
| `npm run test:integration` | 39 files / 149 tests ผ่าน หลังแก้ session lookup ใน OTP test ให้ใช้ controlled clock เดียวกับการสร้าง session |
| Standalone smoke บน loopback:3200 | `/api/health` และ `/banners/acoustic-echoes.svg` HTTP 200 |
| Code review ของ diff ชุด deploy | ไม่มี actionable findings; ไม่รับรอง AWS/provider readiness |
| E2E | ไม่ผ่าน: 5 passed, 2 failed, 1 interrupted, 112 did not run |
| ARM64 Docker build/run | ยังไม่ตรวจ: ไม่มี Docker CLI |
| AWS, provider Live approval, capacity และ restore | ยังไม่ตรวจ |

ประวัติ release verdict (2026-11-02): **blocked** สำหรับ production จาก E2E failures ในรอบนั้น

## หลักฐานรอบตรวจซ้ำ 2026-11-03

Candidate คือ working tree ปัจจุบันหลังปรับปรุง components และ E2E specs ที่พบประเด็นในรอบก่อนหน้า (`owner-debt-repayment-manager.tsx`, `owner-reserve-release-manager.tsx`, `owner-weekly-payout-manager.tsx`, `organizer-finance-view.tsx`, `approved-live-edits.spec.ts`, `cancel-pending-payments.spec.ts`, `debt-repayment.spec.ts`, `public-catalog.spec.ts`, `reservation-expiry.spec.ts`).

| การตรวจ candidate รอบนี้ | ผล |
| --- | --- |
| `npm run typecheck` | ผ่าน: route types generated และ `tsc --noEmit` ผ่าน |
| `npm run lint` | ผ่าน: Biome ตรวจสอบ 366 files ผ่าน ไม่มี warnings/errors |
| `npm run test:unit` | ผ่าน: 56 files / 340 tests ผ่าน |
| `npm run test:integration` | ผ่าน: 39 files / 151 tests ผ่าน |
| `npm run build` | ผ่าน: Next.js standalone build สำเร็จ |
| `npm run test:e2e` | ผ่าน: 120/120 tests ผ่าน (1 worker, 10.2m) ทั้ง desktop และ mobile Chromium |
| Standalone smoke บน loopback | ผ่าน: `/api/health` และ static assets HTTP 200 |
| Code review ของ diff ชุด deploy | ผ่านรอบเดิม; diff ชุดแก้ debt-repayment / finance UI ล่าสุดควรรีวิวเชิงลึกก่อนขึ้นจริง |
| ARM64 Docker build/run | ยังไม่ตรวจ: เครื่องที่เตรียมงานไม่มี Docker CLI |
| AWS, provider Live approval, capacity และ restore | ยังไม่ตรวจ |

Release verdict: **blocked** สำหรับ production deployment. การทดสอบระดับ local-first verification ทั้งหมด (`typecheck`, `lint`, `test:unit`, `test:integration`, `build`, `test:e2e` 120/120) ผ่านครบถ้วน 100% แล้ว แต่ยังติด prerequisites ก่อน rollout ขึ้น production ตาม ADR-0002:
1. การ build และ smoke test ด้วย Docker ARM64 บนเครื่อง build/CI ที่มี Docker CLI
2. การปิดค่า budget/SLO targets ตาม ADR-0002/NQ-04
3. การ provision AWS infrastructure (ECS, private RDS, ALB, SSM SecureString) และ credentials จริง (Cloudflare / Stripe Live / Resend / R2)
4. การทดสอบ multi-instance capacity/load, failover, และ backup/restore policy ก่อนรับ production traffic จริง
