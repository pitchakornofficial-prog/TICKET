# ADR-0002: Local-first และ AWS Singapore เป็น production target

- Status: accepted; production cost baseline revised 2026-10-30
- Date: 2026-10-19
- Updated: 2026-10-30 (Asia/Bangkok)
- Source: T3, T7=A, C6=confirmed, T8=confirmed; ผู้ใช้ยืนยันข้อเสนอปรับลดต้นทุน production วันที่ 2026-10-30
- Related: [ADR-0001](0001-application-and-shared-data.md), [ADR-0003](0003-external-integrations.md), [SPEC-001/NQ-04](../specs/SPEC-001-concert-ticket-lifecycle.md#open-questions)

## Context and change record

คง AWS Singapore, ECS Fargate + ALB, RDS PostgreSQL และ local-first ตามข้อตกลงเดิม
รอบ 2026-10-30 กำหนด baseline เพื่อลดต้นทุนขณะไม่มีผู้ใช้ สำหรับแผนจำหน่าย 4,500 ใบ
และเป้าหมาย 200 ผู้ใช้พร้อมกัน โดยใช้กรอบรายรับค่าธรรมเนียมระบบ 27,000–40,500 บาทประกอบการวางแผน
ตัวเลขรายรับนี้ไม่ใช่งบ cloud ต่อเดือน และไม่เปลี่ยนอัตราค่าบริการรายงานที่ต้องตั้งแยก

ข้อเสนอนี้แทนที่ข้อความเดิมที่ยังไม่กำหนด topology, ขนาดเริ่มต้น และเพดาน scaling
แต่ไม่เปลี่ยน domain/AC หรือรับรอง capacity จากตัวเลขผู้ใช้เพียงอย่างเดียว
ADR เดิมไม่ได้กำหนด NAT Gateway, x86 หรือ Multi-AZ เป็น baseline จึงไม่อ้างว่าลดต้นทุน
50–70% จากระบบเดิมที่วัดจริง และไม่ถือว่า Single-AZ มี availability เท่ากับ Multi-AZ

## Decision

### Compute and scaling

- Region: `ap-southeast-1` (Singapore)
- รัน Next.js standalone container บน Amazon ECS Fargate ผ่าน Application Load Balancer
- Build image เป็น `linux/arm64`; task runtime เป็น Linux/`ARM64` และตรวจ native dependencies/build/runtime จริงก่อน production
- Baseline: `0.5 vCPU / 1 GiB RAM`, minimum 1 task, maximum 4 tasks
- เพิ่ม minimum เป็น 2 tasks ล่วงหน้า 30 นาทีก่อนเวลาเปิดขายบัตรรอบแรก; ลดกลับเป็น 1 หลังพ้นช่วงขายหนาแน่นตามตารางปฏิบัติการของงาน
- ใช้ target tracking CPU 60% และ `ALBRequestCountPerTarget` target 100 requests/target/**นาที** เป็นค่าเริ่มต้นเพื่อทดสอบ ไม่ใช่ 100 concurrent users หรือ 100 requests/second
- หลาย target-tracking policies ให้ scale out เมื่อ policy ใดต้องการ และ scale in เมื่อทุก policy ที่เปิด scale-in ยินยอม โดยรักษา min/max; ต้องเลือก cooldown และตรวจพฤติกรรมจริงก่อนเปิดขาย
- เพดาน DB pool ไม่เกิน 15 connections ต่อ web task รวมทุก pool/process ที่อยู่ใน task นั้น
  ที่ max 4 tasks เท่ากับ steady-state ไม่เกิน 60 connections; ต้องเผื่อ rolling deployment ซึ่งอาจมี task เกิน 4 ชั่วคราว รวม worker, migration และ admin connections
- ตรวจ `max_connections` ของ RDS จริงและจัด deployment surge/connection budget ให้พอ ไม่สมมติว่า `db.t4g.micro` มี 85 connections เสมอ
- ขนาดและ thresholds เป็น baseline ที่ยืนยันสำหรับเตรียม deployment ต้องปรับตามผลทดสอบหากไม่ผ่าน; ยังไม่ใช่หลักฐานรองรับ 200 คน

### Networking and HTTPS

- ใช้ ALB ใน public subnets อย่างน้อย 2 Availability Zones; HTTPS ผ่าน ACM พร้อม health checks
- Fargate อยู่ public subnets โดย `assignPublicIp = ENABLED` และมี route ผ่าน Internet Gateway
- Task Security Group รับ inbound เฉพาะ app port จาก ALB Security Group; ไม่เปิด app port จาก `0.0.0.0/0` หรือ `::/0`
- ให้ task ออก HTTPS ไป ECR/AWS APIs, Omise, Resend และ R2 พร้อม DNS และการเชื่อม PostgreSQL ที่จำเป็น
- RDS อยู่ private DB subnets อย่างน้อย 2 AZ สำหรับ DB subnet group แต่ตัวฐานข้อมูลเริ่มเป็น Single-AZ; `PubliclyAccessible = false`; รับ PostgreSQL เฉพาะ task Security Group
- Baseline ไม่สร้าง NAT Gateway หรือ interface VPC endpoints โดยอัตโนมัติ; public IP ทำให้ task ออกอินเทอร์เน็ตได้โดยตรง แต่ public IPv4 ยังมีค่าใช้จ่าย
- ใช้ Cloudflare DNS/Proxy แทน Route 53 hosted zone; HTTPS จาก Cloudflare ถึง ALB ใช้ Full (strict)
- กำหนด origin access ที่ ALB ให้รับเฉพาะ Cloudflare ranges ที่ดูแลอัปเดต หรือกลไกยืนยัน origin ที่ตรวจได้ เพื่อไม่ให้ bypass การป้องกันที่ Cloudflare ผ่าน ALB โดยตรง
- Cache เฉพาะ public static assets เช่น `/_next/static/*`; bypass checkout, OTP, payment/webhook, ticket/order, back office และข้อมูล session/private ทั้งหมด
- Cloudflare rate limiting/bot protection ใช้ตามสิทธิ์และ quota ของแผนจริง; ไม่สมมติว่า Free plan มีทุกฟีเจอร์หรือเปิดใช้งานให้อัตโนมัติ และคง shared application rate limits ตาม ADR-0004
- ทดสอบ payment webhooks และ client-IP/proxy trust จริง ไม่ให้ cache หรือ bot challenge ขวาง callback ของผู้ให้บริการ

### Database and backups

- ใช้ Amazon RDS for PostgreSQL, Graviton `db.t4g.micro`, Single-AZ, SSD เริ่มต้น 20 GiB
- `db.t4g.small` เป็นทางเลือกเพิ่มขนาดเมื่อ micro ไม่ผ่าน memory/connection/CPU/load checks; ตรวจว่า PostgreSQL version/class/storage ที่เลือกมีใน Singapore ก่อน provision
- Single-AZ ลดต้นทุนแต่ไม่มี standby failover แบบ Multi-AZ; minimum 1 web task ยังไม่ใช่ SLA availability
- เปิด automated backups retention 7 วัน และทดสอบ restore ก่อน production
- ก่อน **ลบฐานข้อมูล** หลังจบการใช้งาน ต้องสร้าง final snapshot และตรวจว่าสำเร็จ พร้อมกำหนด retention/เจ้าของข้อมูล; snapshot ที่เก็บหลังลบ DB อาจคิดเงิน
- การจบคอนเสิร์ตไม่ใช่คำสั่งปิดเว็บหรือลบฐานข้อมูลอัตโนมัติ เพราะยังมี refund/payout/ข้อมูลบัตร และ requirement ให้เว็บทำงานต่อเนื่อง
- ไม่รับรองว่า backup ฟรีเพียงเพราะตั้ง 7 วัน: ตรวจสิทธิ์และพื้นที่ backup รวมเทียบกับ allowance ของ active databases จริง

### Secrets, images and observability

- ใช้ SSM Parameter Store **Standard tier / SecureString / standard throughput** สำหรับ production secrets แทน Secrets Manager เป็น baseline
- ใช้ IAM execution/task roles แบบ least privilege และ KMS ตามสิทธิ์ที่จำเป็น; ไม่ฝัง secret ใน image, source หรือ logs
- ค่าจัดเก็บ standard parameters และ API ที่ standard throughput ไม่มีค่าเพิ่มตามราคา AWS ปัจจุบัน แต่ KMS, customer-managed keys, higher throughput หรือ advanced parameters อาจมีค่าใช้จ่าย จึงไม่เรียกว่า “ฟรีทุกกรณี”
- ECS inject parameter เข้า task; เมื่อเปลี่ยน secret ต้อง rollout task ใหม่และตรวจผล ไม่ได้ rotate/refresh ใน process โดยอัตโนมัติเหมือนกันทุกกรณี
- ใช้ ECR เก็บ image และ lifecycle policy เก็บ release images ล่าสุด 10 เวอร์ชัน โดยกัน image ที่กำลังรันและ rollback target ไว้ก่อนใช้ policy จริง; จำนวน image ไม่รับรองว่าอยู่ภายใน Free Tier
- CloudWatch application logs retention 14 วัน; ปิด Container Insights เป็น baseline และเปิดเฉพาะเมื่อมีเหตุผล/งบรองรับ
- คง metrics/alarms ที่จำเป็นสำหรับ availability, errors, database และ scaling; audit/financial records ในฐานข้อมูลไม่ถูกลบตาม retention ของ application logs

## Cost assumptions and unresolved configuration

เป้าหมายลด fixed overhead โดยตัด NAT และใช้ ARM64/SSM/retention policy ไม่ใช่การรับรองราคาตายตัว
กรอบ **$47–$71/เดือน (ประมาณ 1,600–2,450 บาท)** จากข้อเสนอผู้ใช้เป็นประมาณการตั้งต้นที่ยังไม่ตรวจครบ
ไม่ใช่ใบเสนอราคาหรืองบสูงสุดที่ยืนยันแล้ว; ต้องทำ estimate ใหม่ตาม Singapore และทรัพยากรจริงก่อน deploy

Estimate ต้องรวม Fargate task-hours (รวม pre-scale/rollout), ALB hours/LCU, **public IPv4 ของทั้ง ALB และ tasks**,
RDS instance/storage/CPU credits ที่เกิน allowance, backups/snapshots, ECR storage, logs/metrics/alarms,
KMS, network transfer/cross-AZ, Resend/R2 usage, ภาษี และอัตราแลกเปลี่ยน ไม่หัก Free Tier/credits จนตรวจสิทธิ์จริง
ส่วน Omise แยกเป็นต้นทุนตามธุรกรรมใน ADR-0003 ไม่รวมเป็น fixed cloud cost

ยังต้องกำหนดงบ cloud/เดือนและ alert threshold, workload/RPS/think time/duration/error/latency targets,
ตาราง pre-scale/ลด minimum, cooldown, connection budget ระหว่าง deploy, PostgreSQL version,
RTO/RPO/restore procedure, snapshot retention และวิธี rollout/rollback/migration ก่อน production
คง NQ-04 เปิดเฉพาะส่วนเหล่านี้และผลทดสอบ ไม่กลับไปถือว่า baseline ที่ยืนยันแล้วเป็นคำถามใหม่

## App Runner alternative — not selected

ข้อเสนอ App Runner ถูกเก็บเป็นทางเลือกที่ประเมินแล้ว ไม่แทน ECS Fargate + ALB ในข้อตกลงนี้:

- AWS ปิดรับลูกค้า App Runner ใหม่ตั้งแต่ 2026-04-30; ต้องพิสูจน์ eligibility ของบัญชีก่อนพิจารณา
- เมื่อใช้ VPC Connector ไป private RDS, application outbound traffic ถูกส่งเข้า VPC และไม่ได้ออกอินเทอร์เน็ตอัตโนมัติ
  การเรียก Omise/Resend/R2 ยังต้องมี NAT หรือ egress ที่เหมาะสม; AWS VPC endpoints ไม่แทนการออกอินเทอร์เน็ตไปผู้ให้บริการเหล่านี้
- จึงไม่ใช้ตาราง App Runner “ไม่ต้องมี NAT / รวม $32–$52” เป็น estimate ที่ยอมรับแล้ว
- ECS Express Mode เป็นแนวทางที่ AWS แนะนำแทน แต่ยังสร้าง ALB และคิดค่าทรัพยากรพื้นฐาน ไม่ใช่วิธีตัดค่า ALB ให้เป็นศูนย์

## Verification and delivery boundary

- พัฒนาและตรวจ functional/integration บน local ก่อน; cloud deployment/scaling เป็นงานปลายทางแยกตาม NQ-04/NQ-05
- ก่อน deploy ตรวจ ARM64 image, SG/origin isolation, private DB, secret injection/rotation, webhook, DB pool ระหว่าง rollout, scaling, restore และ estimate ตาม configuration จริง
- ผล local shared-instance ใน TASK-037 ยังเป็นหลักฐานเดิมของ AC-105 ไม่ใช่ ARM64/cloud/load/availability evidence
- รอบเปลี่ยนเอกสารนี้ไม่สร้าง infrastructure, สมัคร provider, เปลี่ยน runtime configuration หรืออนุญาตค่าใช้จ่าย cloud

## Research references

ตรวจเอกสารประกอบ 2026-10-30; ราคาและสิทธิ์บริการต้องตรวจซ้ำก่อน provision

- [Fargate networking](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html)
- [ECS target tracking metrics](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/target-tracking-create-policy.html)
- [Fargate pricing](https://aws.amazon.com/fargate/pricing/)
- [ALB pricing](https://aws.amazon.com/elasticloadbalancing/pricing/)
- [Public IPv4 and VPC pricing](https://aws.amazon.com/vpc/pricing/)
- [RDS PostgreSQL pricing](https://aws.amazon.com/rds/postgresql/pricing/)
- [SSM Parameter Store pricing](https://aws.amazon.com/systems-manager/pricing/)
- [App Runner availability](https://aws.amazon.com/apprunner/)
- [App Runner availability change and ECS Express Mode](https://docs.aws.amazon.com/apprunner/latest/dg/apprunner-availability-change.html)
- [App Runner VPC outbound access](https://docs.aws.amazon.com/apprunner/latest/dg/network-vpc.html)
- [Cloudflare cache defaults](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/)
- [Cloudflare rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)
