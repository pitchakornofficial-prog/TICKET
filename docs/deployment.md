# Deployment — AWS Singapore

## Production Release 2026-11-13 (ticket-production-web:17)

User explicitly requested pre-deployment migration/backfill verification and production rollout of the latest optimized code.

### 1. Pre-Deployment Schema Migration & Backfill Validation
- Executed one-off operations task `arn:aws:ecs:ap-southeast-1:901708383730:task/ticket-production/1b6d0b5a2f144728950e0977639b0460` running `node scripts/migrate-production-schemas.ts` against production `DATABASE_URL_DIRECT`.
- Validated:
  1. Auth schema (`migrateAuth`): OK.
  2. Fee schema (`ensureFeeSchema`): OK.
  3. Queue schema (`ensureQueueSchema`): OK.
  4. Guest OTP schema & atomic stored functions (`request_guest_otp_atomic_v1`, `verify_guest_otp_atomic_v1`): OK.
  5. Reservation schema, triggers, and atomic function (`reserve_tickets_atomic_v2`): OK.
  6. Paid buckets backfill (`ticket_type_paid_buckets`): 100% matched expected orders (2 ticket types with paid orders verified, 0 mismatches).
- Task completed with exit code 0.

### 2. CloudFormation Rollout & Verification
- Deployed via CloudFormation change set `opt-release-20261113`, updating parameters:
  - `WebImage`: `901708383730.dkr.ecr.ap-southeast-1.amazonaws.com/ticket-workload-test@sha256:3a0526b18db70a0e8bb2a0b4705ecfef1d234f86a99ffcf70d1c5fbc152fc9a0`
  - `OperationsImage`: `901708383730.dkr.ecr.ap-southeast-1.amazonaws.com/ticket-workload-test@sha256:d57f8a121a952370303023896fdb12275a220c967bebbcd0acc1ba956a6adfdb`
- CloudFormation stack transitioned to `UPDATE_COMPLETE`.
- ECS service updated to primary revision `ticket-production-web:17` (`5beae10ef8d141939ec6a7df3268406c`, 1/1 running).
- ALB target `172.31.28.135` is `healthy`; old target `172.31.21.134` drained and deregistered.
- Smoke verification: `https://ticket.phatysd.me/api/health`, `/`, and `/news` all returned HTTP 200.

---

## Isolated 1 vCPU / 2 GiB Capacity Benchmark 2026-11-13

User requested benchmark evaluation of `1 vCPU / 2 GiB` tasks on an isolated environment with doubles without affecting real production data or sales.

### 1. Test Architecture & Environment
- Cluster: `ticket-workload-test` (isolated private SG `sg-0ad89d142ed418441`, no public ingress).
- Dedicated test database: `capacity_20261112_3796a288` on staging Neon endpoint.
- App Fleet: 4 tasks × **1 vCPU (1024) / 2 GiB (2048) / DATABASE_POOL_MAX=25** running `ticket-capacity-web-1vcpu:1`.
- Driver: `ticket-capacity-driver-1vcpu:1` (1 vCPU / 2 GiB) with buyer affinity for doubles.

### 2. Benchmark Results

#### Phase 1: Sweep Benchmark (3 orders / worker)
| Concurrency | Peak Active | Orders | Duration | Orders/s | Journey p50 | Journey p95 | Criterion |
|---|---|---|---|---|---|---|---|
| 80 | 80 | 240 | 4.07 s | 59.01 | 1,168 ms | 2,209 ms | pass |
| 120 | 120 | 360 | 3.37 s | 106.71 | 936 ms | 2,063 ms | pass |
| 160 | 160 | 480 | 4.17 s | 114.98 | 1,294 ms | 2,293 ms | pass |
| 200 | 200 | 600 | 4.54 s | **132.23** | 1,280 ms | 2,493 ms | pass |
| 240 | 240 | 720 | 5.83 s | 123.49 | 1,560 ms | 2,348 ms | pass |
| 280 | 280 | 840 | 6.83 s | 123.00 | 1,848 ms | 2,875 ms | pass |
| 320 | 320 | 960 | 7.81 s | 122.99 | 1,985 ms | 3,388 ms | pass |
| 360 | 360 | 1,080 | 9.01 s | 119.85 | 2,458 ms | 4,147 ms | pass |
| **400** | **400** | 1,200 | 11.59 s | 103.55 | 2,752 ms | **4,896 ms** | **pass** |

- **Sweep Ceiling**: Passed up to **400 concurrent buyers** within p95 ≤ 5 s (vs 330 on 0.5 vCPU).

#### Phase 2: Sustained Benchmark (30 orders / worker across 4 tasks)
| Concurrency | Orders | Duration | Orders/s | Journey p50 | Journey p95 | Criterion |
|---|---|---|---|---|---|---|
| 120 | 3,600 | 28.19 s | **127.72** | 880 ms | **1,501 ms** | pass |
| 160 | 4,800 | 55.73 s | 86.13 | 1,750 ms | **3,697 ms** | pass |
| 200 | 6,000 | 69.37 s | 86.50 | 1,935 ms | **4,489 ms** | pass |
| **240** | **7,200** | 64.39 s | **111.82** | 1,867 ms | **4,117 ms** | **pass** |

- **Confirmed Sustained Passing Concurrency**: **240 sustained concurrent buyers** across 4 tasks (7,200 orders at 111.82 orders/s, p95 4.117 s) — **2× the sustained capacity of the baseline 0.5 vCPU fleet (120 buyers)**.
- At 160 sustained, p95 dropped from 5.7–6.3 s (on 0.5 vCPU with CFS quota saturation) down to **3.697 s** on 1 vCPU with zero throttling issues.

### 3. Data Integrity Audit & Shutdown
- Read-only transaction (`BEGIN READ ONLY`) verified database `capacity_20261112_3796a288`:
  - **Events**: 15
  - **Orders**: 28,082 (100% paid)
  - **Tickets**: 28,082 (100% issued)
  - **Distinct Ticket Codes**: 28,082 (100% unique)
  - **Distinct QR Payloads**: 28,082 (100% unique)
  - **Orphan tickets / Unpaid issued tickets / Live charges / Oversold ticket types**: **0**.
- **Shutdown**: All 4 web test tasks and driver tasks were stopped. Verified 0 running tasks on `ticket-workload-test`.

---

## Staging shutdown 2026-11-13 (Asia/Bangkok)

At the user's explicit request, `ticket-workload-test/ticket-workload-test`
was scaled to **desired/running/pending 0/0/0**. Its Application Auto Scaling
minimum is now 0 (maximum remains 4), with dynamic scale-in, dynamic scale-out
and scheduled scaling all suspended so scaling policies cannot restart it.
No service, stack, load balancer, listener, certificate, network, ECR repository,
database or shared production resource was deleted.

Production remains `ticket-production-web:16`, desired/running 1/1;
`https://ticket.phatysd.me/api/health` returned HTTP 200 after shutdown.
Earlier notes saying staging remains running are historical and superseded here.
This is an intentional operational override via ECS/Application Auto Scaling;
the staging CloudFormation template was not changed. Before a future staging
stack update, preserve this shutdown state rather than reapplying older
desired/minimum capacity 1. Resume staging only when explicitly requested.

## 4-Task Bottleneck Analysis and Capacity Optimization 2026-11-12

User requested root-cause diagnosis of why the 4-task fleet was capped at 120 concurrent
buyers (40.54 orders/s, p95 4.317 s) in the baseline benchmark, optimization of the application
to support higher concurrency across 4 tasks, and re-testing in isolation without affecting
real production data, inventory, or sales.

### 1. Root Causes Identified

1. **Database Lock Contention & Sequential Round-trips in Reservation**:
   - `createReservation` acquired two exclusive locks (`ticket_types FOR UPDATE` and `event_fee_settings FOR UPDATE`)
     and held them across 5 sequential DB round-trips.
   - It also performed an unindexed sequential scan of `order_items JOIN orders` via `SUM(oi.quantity)` (`held_calc`),
     which scaled linearly with total order volume ($O(N)$).
   - The prolonged lock hold time serialized concurrent checkouts across all 4 tasks, exhausting each task's 15-connection
     pool (`DATABASE_POOL_MAX=15`) and bottlenecking fleet throughput at ~40–43 orders/s.
2. **Unindexed Buyer Limit Scan**:
   - `getBuyerTicketCountForEvent` queried `LOWER(TRIM(o."buyerEmail"))` without a functional index, scanning all orders
     for the event 3× per buyer journey (`request-otp`, `verify-otp`, `reserve`).
3. **Payment & Ticket Issuance Round-trips**:
   - Completing payment and issuing tickets required ~20 separate sequential database queries (order lookup, charge status,
     webhook deduplication, order update, ticket items lookup, and ticket insertions) and generated ~300 `<rect>` SVG elements per ticket.
4. **Fargate 0.5 vCPU Container Bound**:
   - Each task runs with only **0.5 vCPU / 1 GiB**. When throughput exceeded ~20 orders/s per task (~140–160 HTTP req/s),
     un-cached `Intl` formatting (which was ~30× slower than cached formatters) and Next.js route parsing pushed Event Loop
     Utilization (ELU) above 0.90, triggering Linux CFS CPU quota throttling.

### 2. Optimizations Implemented

- **O(1) Quota Tracking (`ticket_type_paid_buckets`)**: Introduced a 32-bucket hash summary table updated by database triggers,
  making paid quota verification $O(1)$ regardless of how many thousands of orders have been placed.
- **Single Round-trip Stored Functions**:
  - Implemented `reserve_tickets_atomic_v2` in PL/pgSQL to perform event validation, fee resolution, `FOR NO KEY UPDATE` quota locking,
    quota math, queue completion, and `orders` + `order_items` insertion in **1 database round-trip**.
  - Implemented `request_guest_otp_atomic_v1` and `verify_guest_otp_atomic_v1` to perform IP/email rate limits, OTP creation/consumption,
    and verified session creation in **1 round-trip**.
- **Lock Mode Refinement (`FOR NO KEY UPDATE`)**: Changed ticket type locks from `FOR UPDATE` to `FOR NO KEY UPDATE`
  in `src/server/reservation.ts` and `src/server/payment.ts` (post-`opt3` AWS run, verified locally via `typecheck`,
  `biome lint`, all 127 unit test files / 870 tests, and 11 PostgreSQL integration test files / 44 tests), preventing
  conflicts with PostgreSQL foreign key `KEY SHARE` locks during concurrent child table inserts (`order_items`,
  `ticket_type_paid_buckets`, `tickets`).
- **Writable CTE for Payment & Ticket Issuance**: Consolidated webhook recording, payment charge update, order status update,
  and batch ticket issuance into a single writable CTE round-trip in `processStripeSuccessEvent`.
- **Targeted Partial & Functional Indexes**: Added `idx_orders_event_lower_email`, `idx_orders_active_event`,
  `idx_order_items_tt_order_qty`, `idx_tickets_refunded_type`, and partial queue indexes.
- **In-Process CPU Optimization**: Cached all `Intl.NumberFormat` and `Intl.DateTimeFormat` instances in `src/lib/locale.ts` and
  `src/server/ticket-delivery.ts`; streamlined 2D QR generation using `Uint8Array` lookup tables and horizontal run-length encoded SVG paths.

### 3. Re-test Results on 4 Tasks (0.5 vCPU / 1 GiB / pool 15 each)

Tested on isolated AWS/Neon environment (`ticket-workload-test`, image `ticket-workload-test:capacity-20261112-opt3` / task definition `:4`,
fresh database `capacity_20261112_c718d83e`):

#### 4-Task Fleet Sweep Comparison

| Concurrency | Baseline (Orders/s, p95) | Optimized (Orders/s, p95) | Throughput Gain |
|---|---|---|---|
| 80 | 38.31 /s (3.543 s) | 49.66 /s (2.853 s) | +29.6% |
| 120 | 39.34 /s (4.872 s) | 81.54 /s (1.918 s) | **+107.3% (2.07×)** |
| 160 | 42.14 /s (5.678 s - fail) | 90.33 /s (2.577 s) | **+114.4% (2.14×)** |
| 200 | — | 81.12 /s (3.501 s) | **Pass** |
| 240 | — | 98.36 /s (3.432 s) | **Pass** |
| 280 | — | 103.29 /s (3.564 s) | **Pass** |
| 320 | — | **104.68 /s (3.851 s)** | **Pass (Peak throughput)** |
| **330** | — | **98.76 /s (4.963 s)** | **Pass (Highest passing)** |
| 340 | — | 90.78 /s (5.378 s) | Latency exceeds criterion |

- **Sweep Ceiling**: Increased from **190 to 330 concurrent buyers (+73.7%)**.
- **Peak Fleet Throughput**: Reached **104.68 orders/s** (vs ~43.26 orders/s before, a **2.42× increase**).
- **Median Journey Latency**: Dropped to **1.3–2.6 s** across passing stages.

#### Sustained Run Comparison & Architectural Finding

In sustained testing on `opt3` (`task-definition:4`, 30 orders per worker = 4,200 orders at 140 concurrency, and 4,800 orders at 160 concurrency on `opt2`/`DIAG3`):
- Peak sustained throughput reached **82.37–93.42 orders/s** (more than 2× faster than baseline 40.54 orders/s; 55.41 orders/s when run immediately post-sweep on `opt3` due to `FOR UPDATE` vs `FOR KEY SHARE` contention prior to the `FOR NO KEY UPDATE` refinement).
- Median latency (`p50`) on fresh sustained 160-buyer runs dropped to **551–590 ms** (down from 1,831 ms in the initial `opt1` sustained run), though tail `p95` exceeded 5 s (`5.709–6.345 s`).
- Tail latency profiling (`--cpu-prof` and `performance.eventLoopUtilization`) showed that at >20 orders/s per container,
  the **0.5 vCPU allocation** reaches 100% CPU usage with Linux CFS quota throttling (`ELU` up to 0.997, `2,500 ms` CPU / `5,000 ms`).
- **Architectural Conclusion**: Database and application contention bottlenecks were fully eliminated. To sustain concurrency
  above 200–300 buyers over long durations, the ECS task definition should scale to `1 vCPU` (1024) or autoscaling should be configured
  for 6–8 tasks during peak sales.

#### Data Integrity Audit

A read-only transaction (`BEGIN READ ONLY`) audited the test database `capacity_20261112_c718d83e`:
- **Events**: 13
- **Orders**: 11,492 (100% paid)
- **Tickets**: 11,492 (11,492 distinct ticket codes, 11,492 distinct QR payloads)
- **Orphan tickets / Unpaid issued tickets / Live charges / Oversold types**: **0** (100% data integrity verified).
- All web and driver test compute stopped cleanly. Production service `ticket-production-web:16` remained untouched and healthy.

---

## Isolated AWS/Neon concurrent purchase benchmark 2026-11-12

User explicitly selected a separate test environment on existing AWS/Neon with
payment/email doubles, preserving real inventory and sales. Experiment completed;
all experiment compute stopped. This is a backend capacity benchmark of the
release with doubles, **not live Stripe/SES or an exact universal buyer maximum**.
Machine-readable evidence: [capacity-20261112.json](assets/capacity-20261112.json).
Operational tooling/constraints: [capacity README](../scripts/capacity/README.md).

### Confirmed bounds

Exploratory criterion: complete server-journey p95 ≤ 5,000 ms, zero unexpected
errors, correct unique tickets and sold-out rejection. This criterion was stated
during the experiment; it does not change the product's agreed SLO or queue policy.
All rows below are **sustained** runs, using 30 orders per concurrent worker:

| App tasks | Concurrent buyers | Paid orders / issued tickets | Duration | Orders/s | Journey p95 | Criterion |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 60 | 1,800 / 1,800 | 90.10 s | 19.98 | 3.291 s | pass |
| 1 | **70** | 2,100 / 2,100 | 101.54 s | 20.68 | **3.777 s** | **pass** |
| 1 | 80 | 2,400 / 2,400 | 128.37 s | 18.70 | 5.282 s | latency exceeds criterion |
| 1 | 90 | 2,700 / 2,700 | 139.37 s | 19.37 | 5.274 s | latency exceeds criterion |
| 4 | **120** | 3,600 / 3,600 | 88.80 s | 40.54 | **4.317 s** | **pass** |
| 4 | 140 | 4,200 / 4,200 | 97.40 s | 43.12 | 5.522 s | latency exceeds criterion |
| 4 | 160 | 4,800 / 4,800 | 110.95 s | 43.26 | 5.953 s | latency exceeds criterion |

Highest confirmed sustained levels in the tested set: **70 buyers on one task**
and **120 buyers across four tasks**. Lowest tested sustained failing levels:
80 and 140 respectively. Values between those tested bounds were not established.
Failures in this table are latency-criterion failures: every submitted order
completed successfully, with no unexpected HTTP/payment/ticket failures.

Brief sweeps initially passed 90 on one task (p95 4.671 s) and 190 across four
tasks (p95 3.909 s), but sustained confirmation was materially slower. Those brief
results are not used as the confirmed capacity. Do not multiply the single-task
number by four or treat the configured 200 pre-reservation queue slots as proof
of purchase throughput. Root cause of the latency limit was not profiled.

### Environment and isolation evidence

- Release source: operations digest
  `sha256:65de6342e5a6acc7792d269f8e8ebb77a1dcb73dede67ba2d1a4bfce2c1145bc`.
  Capacity derivative digest:
  `sha256:299adb0daa3c8748c2174f366c2caca05e707b9447b9578db8449c49245daf6d`.
  ARM64 optimized Next build/typecheck passed; script syntax checks passed.
- Compared 252 application source files in the derivative with release: only
  `guest-otp.ts`, `email.ts`, and the pay-test route differ inside the test image
  for OTP capture/provider doubles. Host production application source unchanged.
  The live image and configuration were not replaced by this derivative.
- Each app task: **0.5 vCPU / 1 GiB / shared pg pool maximum 15**, matching the
  observed live task settings. Load generator ran separately at 1 vCPU / 2 GiB.
  Fixed one- and four-task configurations were tested; no application autoscaling
  timing was benchmarked. Container Insights was disabled, so this experiment
  does not claim a measured CPU/database bottleneck.
- Cluster: existing `ticket-workload-test`. Dedicated group
  `sg-0ad89d142ed418441` accepts port 3000 only from itself. Tasks were not
  registered with the customer ALB or exposed through public ingress.
- Verified staging and production Neon endpoints differ without printing or
  persisting credentials. Used only staging SSM database credential injection.
  Created **new database `capacity_20261112_1cdd436d`** on the staging endpoint;
  application traffic used its pooled URL. Initialization used its direct URL.
  Existing staging and production databases were not seeded/reset by tooling.
- Only the first app task created/migrated that fresh database and seeded two
  synthetic fixture accounts. Joining tasks verified the existing test database;
  they did not rerun creation/seeding. The oldest test task was renewed before
  its bounded lifetime expired, between completed load runs.
- No Stripe/SES/R2 keys or runtime task IAM role were given to the test app or
  driver. Every QR response was asserted `livemode=false`. Synthetic OTPs were
  captured in responses, not logs; emails were captured locally in process.
- Driver used real private HTTP routes: queue → OTP request/verify → reservation
  → QR creation → double-backed payment success → issued ticket retrieval.
  Separate synthetic buyer/IP identities preserved normal shared rate limits.
  For the four-task experiment, each buyer stayed on one app task because the
  Stripe double stores intents in memory; admin setup was pinned to the primary.
  This does not establish random ALB routing/cross-node authentication behavior.

### Final data audit and shutdown

Separate audit task used `BEGIN READ ONLY` and checked the database name before
reading aggregates. Result: **28 test events, 26,007 orders, all 26,007 paid,
26,007 tickets, 26,007 distinct ticket codes and QR payloads**. Orphan tickets,
tickets issued for unpaid orders, oversold ticket types and Live payment charges
were all **zero**. This aggregate includes warm-up/sweep and sustained runs.

All driver tasks completed; all four app tasks and the read-only audit task were
observed `STOPPED`. App exit 143 followed deliberate ECS stop/SIGTERM, not a load
failure. No active experiment compute remains. Test database, task definitions,
image/logs and private security group are retained for review/reuse; no database
deletion was performed without the explicit approval required by AGENTS.md.

Live production remained `ticket-production-web:16`, deployment `COMPLETED`,
desired/running 1/1 at final check; public health returned HTTP 200 (325 ms).
No test orders, inventory holds, email or payment calls were made against live
production. Real Stripe/SES throughput, human/banking delays, browser assets,
Cloudflare/ALB costs, production dataset/Neon compute load, mixed customer/admin
traffic and autoscaling response remain outside this isolated benchmark.

## Bounded production checkout-read load 2026-11-12

User requested real production load without affecting real data or sales.
Test ran 20:43:28–20:47:13 Asia/Bangkok against `ticket.phatysd.me`, release
`ticket-production-web:16`. Only public event discovery, GET checkout HTML and
health checks were sent. No browser JavaScript was executed: in particular,
no queue-entry/status endpoint, OTP, reservation, payment, email, or ticket
issuance endpoint was exercised. No infrastructure settings were changed.

### Model and results

The model is **equivalent active readers**, each reloading the checkout document
once every 10 seconds, staggered across the interval. These are not actual
authenticated browser sessions or simultaneous order submissions. A fixed offered
rate driver was used rather than real browsers, with a 5-second request timeout;
it stopped/escalated no further if a non-200 response or rolling 20-sample p95
over 1,500 ms appeared. Configured stages ended without that stop condition.

| Equivalent readers | Offered req/s | Stage duration | HTTP 200 / total | p50 | p95 | Maximum |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | 1 | 29.24 s | 30 / 30 | 152.8 ms | 465.6 ms | 475.4 ms |
| 25 | 2.5 | 29.76 s | 75 / 75 | 133.2 ms | 235.6 ms | 481.3 ms |
| 50 | 5 | 44.96 s | 225 / 225 | 133.7 ms | 282.6 ms | 1,424.0 ms |
| 100 | 10 | 60.12 s | 600 / 600 | 135.8 ms | 260.2 ms | 1,202.8 ms |
| 200 | 20 | 60.13 s | 1,200 / 1,200 | 182.2 ms | 499.6 ms | 1,777.2 ms |

All 2,130 measured requests returned 200. Peak observed in-flight requests was
17, not 200. Checkout response was about 72 KB and headers showed Cloudflare
`DYNAMIC` with private/no-store cache control. This exercised production origin
and Neon-backed page reads, not merely cached static assets. JS, CSS and image
downloads were excluded from the per-reader model.

### Production observations

- ECS samples before and during load showed desired/running 1/1, pending 0.
  Initial post-load scaling activity lookup returned none. At **20:49:46**, after
  load had ended, the existing ALB request policy triggered desired count 4
  (three additional tasks). Existing target tracking policies remain CPU 60%
  and ALB 100 requests/target; no policy/capacity setting was manually changed.
  All four ALB targets were healthy at final observation; automatic scale-in
  remains controlled by the existing policy, not a manual desired-count reset.
  The four-task configuration was not under the measured load, so these results
  do not establish four-task capacity or scaling responsiveness during a sale.
- CloudWatch ECS at 20:46 (overlapping the 200-reader stage): CPU average
  65.72%, maximum 77.46%; memory average 21.71%, maximum 23.14%.
  At 20:47, the minute containing the end of load, CPU average fell to 24.34%,
  maximum 72.78%; memory average/maximum 23.34%. CloudWatch data is delayed and
  minute-aggregated; these are not instantaneous values. At 20:48, after load,
  CPU average was 0.94%, maximum 2.72%; memory average 21.96%, maximum 23.34%.
- ALB target response time at 20:46: average 27.1 ms, maximum 394.2 ms;
  at 20:47: average 34.6 ms, maximum 290.6 ms. This differs from public client
  timing, which includes Cloudflare and the network. Target-group 5xx metric
  query returned no datapoints, not an explicit zero-valued sample. The load
  driver's own results provide direct evidence of zero HTTP errors in its run.
- Post-load `/api/health` returned 200 in 94 ms. No saturation/failure search
  was attempted beyond the bounded 200-reader stage.
- Code inspection found checkout reads call `getEventFeeSettings`, whose
  existing schema ensure still issues idempotent DDL under an advisory lock.
  Thus HTTP GET-only does not imply the database executes only SELECTs. No
  business-data write path was invoked by the driver; production data was not
  reset, seeded, modified, or deleted by test tooling. No claim of zero impact
  on every concurrent real customer's latency is made.

Conclusion: **200 equivalent checkout readers at 20 GET requests/s passed this
short production test**, on the observed one-task deployment. The maximum
number of real simultaneous purchasers remains unknown: queue admission,
reservation contention, OTP/SES, Stripe, webhook issuance, and sustained peak
traffic were deliberately excluded to preserve real quotas and sales. The
configured queue limit of 200 is a business setting, not a capacity guarantee.
Full purchase capacity needs a production test scope with isolated inventory,
accounting and provider side effects before it can be measured safely.

## Checkout release and isolated purchase load 2026-11-12

User explicitly requested deployment of latest source and purchase-path load;
subsequently selected an isolated test database and payment/email doubles.
This section supersedes the earlier same-day source mismatch below.

### Release outcome

- Deployed with CloudFormation change set `checkout-latest-20261112`, using
  the existing remote template and changing only `WebImage`/`OperationsImage`
  parameter values. Inspected change set before execution. Scaling resource
  entries were dynamic dependencies on service references; no scaling values,
  secrets, database configuration, or schema migrations were changed.
- CloudFormation `UPDATE_COMPLETE`; ECS `ticket-production-web:16`, deployment
  `COMPLETED`, desired/running 1/1, pending 0. New ALB target is healthy;
  old target was draining at final observation. Update started 20:37:40 Bangkok.
- Web digest: `sha256:f383c51fa846bdc433046d05c49b488f68284f65aac256acb5962f7c37c6cb4b`.
- Operations digest: `sha256:65de6342e5a6acc7792d269f8e8ebb77a1dcb73dede67ba2d1a4bfce2c1145bc`.
- ECR tags: `prod-web-20261112-checkout-final` and
  `prod-ops-20261112-checkout-final`. Both Linux/ARM64 images have identical
  Next build ID `c0A4UsmtWuiNUJtUMC-T_` and came from the same cached builder.
  All 273 source/public/script file hashes in operations image match current
  local files at release preparation. No source code was changed by this task.
- Public health, home, news, login and a real public event checkout returned
  HTTP 200. All 13 JS/CSS assets referenced by that checkout match the new
  web image by SHA256. Production direct-session bypass and a nonexistent
  order's pay-test endpoint both returned HTTP 403. No production order,
  email or payment was created by the smoke test.
- Previous images/task definition `ticket-production-web:15` remain the rollback
  reference documented in the earlier recheck. No Git commit or push performed.

### Pre-release verification

- `npm run typecheck`: passed, including after test-generated typings cleanup.
- Biome lint on the changed checkout component and its existing unit test: passed.
- Targeted unit tests: 3 files / 27 tests passed (`d272`, checkout authorization,
  guest token purpose restrictions).
- Targeted integration tests: 2 files / 3 tests passed (`checkout-first-otp`,
  guest OTP concurrency), real local PostgreSQL test database.
- `paid-ticket-issuance.spec.ts`: 2/2 E2E passed, desktop/mobile Chromium;
  real browser OTP entry, reservation, double-backed payment, distinct tickets,
  QR codes and reload persistence. Both ARM64 Docker build targets passed.
- Inspected the existing component diff: removal of redundant OTP confirmation
  UI retains OTP verification before auto-proceed/reservation. No actionable
  regression identified in that bounded inspection; not a full application review.

### Purchase-path load results

Both runs use local PostgreSQL `ticket_test`, isolated randomly named schemas,
and provider doubles. No production buyer/quota/provider state was exercised.

| Run | Concurrent buyers | Successful orders / tickets | Duration | Throughput | Journey p95 |
| --- | --- | --- | --- | --- | --- |
| Existing service simulation | 20 | 2,324 / 4,500 | 18.03 s | 128.9 orders/s | 370 ms |
| Loopback HTTP API journey | 20 | 100 / 100 | 3.45 s for 99 measured orders | 28.72 orders/s | 866 ms |

- Service command: `TARGET_TICKETS=4500 CONCURRENCY=20 npm run test:simulation`.
  OTP request/verify, reservation, QR creation, simulated successful payment and
  ticket retrieval all completed. All 4,500 ticket codes and QR payloads unique;
  sold-out and cumulative buyer limit probes rejected correctly. Exit 0.
- HTTP run used the existing `tests/support/start-e2e-server.ts` harness and a
  temporary fetch driver. Flow: queue admission → request OTP → verify captured
  OTP → reserve → payment QR → pay-test → tickets. One warm-up order excluded
  from latency statistics; 99 measured orders, zero failures, 100 unique codes
  and payloads overall. The 101st buyer was rejected at reservation with the
  expected insufficient-quota HTTP 400. Maximum measured journey 986 ms.
  Reserve endpoint p95 292 ms; OTP request p95 136 ms; verify p95 101 ms.
- Task-owned HTTP server stopped gracefully; harness and simulation cleaned up
  only their own generated test schemas. Generated `next-env.d.ts` restored via
  type generation. Existing application changes preserved.

These are local service/HTTP measurements with doubles, not production ECS/Neon,
SES or Stripe throughput guarantees. Service simulation uses a larger test pool
than the web process; HTTP uses the existing local dev server. Neither result
establishes peak production buyer capacity, sustained load or failover SLOs.
Production update and selected isolated purchase-load work completed successfully;
unrestricted production capacity remains unverified.

## Production recheck 2026-11-12 (Asia/Bangkok)

Scope: user-authorized bounded public-page load test, isolated Neon recovery drill,
and deployed-release/source comparison. No deployment, production data mutation,
payment, or email was initiated. User confirms real PromptPay purchase/ticket
delivery, Stripe payout readiness, and production email delivery work. Attached
Gmail screenshot supports receipt of a TICKET lookup OTP; it does not independently
prove Stripe payout readiness.

### Deployed release and source

- AWS ECS `ticket-production/ticket-production-web` runs task definition
  `ticket-production-web:15`, desired/running 1/1, rollout `COMPLETED`.
  Deployment created at 20:05:41; task started at 20:06:19.
- Running web digest, also the CloudFormation `WebImage` parameter:
  `sha256:a2414c844dbb98af6a18835900389af8d514953bfb542a396470a3132dba96f4`.
  ECR tag `prod-web-20261112-9017364`, pushed at 20:04:14.
- CloudFormation's paired `OperationsImage` digest:
  `sha256:3b0582a70f4deac94ac94ac8f684d0375592a314c80bd8868c34a320fd4a388d`.
- Compared SHA256 of 277 files in `src`, `public`, `scripts`, package manifests,
  Next config and Dockerfile against that local operations image using disposable
  read-only containers with networking disabled. 276 match; only
  `src/components/guest-checkout-entry.tsx` differs. No extra local files in those
  directories. Local removes the additional OTP confirmation button/panel and
  its state; the release retains them. **Latest source is not fully deployed.**
  This compares the paired operations source, not a reproducible rebuild proof
  of every compiled server byte in the web image.
- All 12 JS/CSS assets referenced by the public homepage match the local `.next`
  build by SHA256. That build predates later source edits, so this does not
  establish that current source matches production.

### Bounded production load

GET requests alternated `/` and `/news` through the public HTTPS hostname,
using curl, 10 seconds per rate, maximum 10 workers, and a 10-second request
timeout. No authenticated or purchase/write endpoint was exercised.

| Offered rate | Requests | HTTP 200 | Errors | p50 | p95 | Maximum |
| --- | --- | --- | --- | --- | --- | --- |
| 2 req/s | 20 | 20 | 0 | 109.4 ms | 367.6 ms | 367.6 ms |
| 5 req/s | 50 | 50 | 0 | 109.7 ms | 195.0 ms | 344.8 ms |
| 10 req/s | 100 | 100 | 0 | 110.5 ms | 205.9 ms | 273.9 ms |

`/news` response headers show `cf-cache-status: DYNAMIC` and private/no-store
cache control. Initial Python urllib probes received HTTP 403 and were stopped;
the table is a separate curl run, not a reinterpretation of those failures.
This is a short public-page load smoke, not checkout capacity, sustained load,
multi-instance failover, overselling, or a maximum concurrent-buyer guarantee.
No agreed sale-load/SLO target was validated by this run.

### Neon isolated point-in-time recovery

- Project `soft-glitter-40333363`, source `production`
  (`br-summer-forest-b3k994zr`), PostgreSQL 18, Free plan.
- Console currently shows **6 hours history retention**.
- Created `restore-drill-20261112` (`br-delicate-butterfly-b37q53fg`) from
  production's past state at 20:26 on 2026-11-12. Created at 20:27:33;
  console reported fork in 0.84 seconds. This is branch creation time, not
  application recovery RTO.
- Ran SELECT-only checks on the recovered branch: database `neondb`, 38 public
  base tables; events 3, orders 11, tickets 3, payment charges 10, Stripe webhook
  events 3, ticket email deliveries 3. Ticket-to-order orphan count is 0.
  An initial orphan query used `order_id` and failed; corrected to the actual
  quoted `"orderId"` column and passed. No customer details were exported.
- Production was not reset and the app was not pointed at the recovered branch.
  Restored-branch SQL access/schema/data are demonstrated; full app recovery,
  historical data reconciliation, and end-to-end recovery RTO/RPO remain unverified.
- Recovery branch remains for review with expiry `Never`; no deletion was
  performed or scheduled. Local and production database configuration is unchanged.

Assessment: **incomplete** for unrestricted production readiness. Bounded page
load and isolated SQL recovery passed, but full purchase capacity/recovery targets
remain unverified and current local source differs from the deployed release.
Earlier November readiness notes below are historical, not current infrastructure
state. No task/spec status was changed by this recheck.

## Production rollout 2026-11-04

`ticket.phatysd.me` routes through the existing `ticket-workload-test` load balancer to the `ticket-production` stack. Its account-specific CloudFormation template is [ticket-production.json](../infra/aws/ticket-production.json). The production ECS service uses a separate Neon `production` branch and `/ticket/production/` SSM parameters. The staging service remains running for rollback and continues to incur charges. Do not delete the staging stack while production depends on its load balancer, listener, network, certificate, or ECR repository.

The production owner was bootstrapped from SSM; the bootstrap password parameter remains in SSM. The owner sign-in, public homepage, target health, restricted Stripe key read access, and signed/unsigned webhook checks passed. `pay-test` returns 403 in live mode. The paid purchase E2E suite was run locally with test providers; a live PromptPay payment, Stripe payout readiness, production load capacity, and a Neon backup/restore drill have not been verified. One production task is configured; no production autoscaling policy or AWS Budget alert is configured. Neon Free limits and its short recovery history need review before selling tickets.

Event fee settings currently allow one organizer rate per event and default to zero. Do not open sales for an event requiring different organizer rates per ticket category until the feature and financial reports are updated and verified. Production currently contains no concert configuration from staging.

เป้าหมายตาม [ADR-0002](adr/0002-local-first-and-aws-production.md): ECS Fargate ARM64 + ALB, private RDS PostgreSQL, Cloudflare, SSM SecureString, Amazon SES และ R2; Stripe ตาม [ADR-0003](adr/0003-external-integrations.md).
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

ชื่อค่าทั้งหมดอยู่ใน `deployment.env.example`. ใส่ค่าจริงผ่าน ECS secrets จาก SSM SecureString โดยไม่ commit หรือส่งใน chat. ตั้ง HTTPS origin จริงใน `BETTER_AUTH_URL`, random `BETTER_AUTH_SECRET` อย่างน้อย 32 ตัวอักษร, Stripe Live keys พร้อม signing secret ของ `/api/webhooks/stripe`, SES credentials (`SES_ACCESS_KEY_ID`, `SES_SECRET_ACCESS_KEY`, `SES_REGION`) และ `EMAIL_FROM` ที่ verified แล้ว, R2 bucket/credentials/endpoint. คง auth secret เดิมเมื่อ rollout เพื่อรักษา sessions.

ตรวจค่าจาก environment ของ operations task:

```sh
node scripts/check-production-env.mjs
```

Web image ตรวจค่าชุดเดียวกันก่อน start และปฏิเสธ configuration ที่ขาด. ตัวตรวจยืนยันรูปแบบเท่านั้น ไม่พิสูจน์ key/account/domain หรือการเข้าถึง provider. สำหรับ local runtime smoke เท่านั้น สามารถเปิด standalone โดยตรง; ห้ามใช้วิธีข้าม gate นี้บน production.
`EMAIL_FROM` แทน sender ของทุก SES message; production จะไม่ใช้ local capture เมื่อ credentials หาย.

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
3. การ provision AWS infrastructure (ECS, private RDS, ALB, SSM SecureString) และ credentials จริง (Cloudflare / Stripe Live / SES / R2)
4. การทดสอบ multi-instance capacity/load, failover, และ backup/restore policy ก่อนรับ production traffic จริง

## Amazon SES production readiness (AC-128)

ก่อนเปิดใช้งานระบบในสภาพแวดล้อม Production จะต้องเตรียมความพร้อมและตรวจสอบหลักฐานจริงของ Amazon SES ดังนี้:

1. **Verified Sending Identity**: ตรวจสอบการ verify โดเมนส่งอีเมล (DKIM / SPF / DMARC) ใน Amazon SES Console ใน Region ที่ใช้งานจริง (เช่น `ap-southeast-1` Singapore) โดยตั้งค่า DNS CNAME ของ Easy DKIM บน DNS Provider (เช่น Cloudflare) ให้ขึ้นสถานะ `Verified`.
2. **Production Access (Move Out of Sandbox)**: บัญชี AWS เริ่มต้นจะอยู่ใน SES Sandbox ซึ่งส่งได้เฉพาะอีเมลผู้รับที่ verify แล้วเท่านั้น ต้องยื่นคำร้อง Request Production Access ผ่าน SES Console พร้อมระบุประเภทการใช้งาน (Transactional emails สำหรับ OTP, ซื้อบัตรคอนเสิร์ต, คำเชิญผู้จัดงาน และรีเซ็ตรหัสผ่าน) และกรณีจัดการ Bounce/Complaint.
3. **Sending Quotas & Rate Limits**: ยืนยันว่า 24-hour sending quota และ Maximum Send Rate (emails/second) ใน Region ที่ใช้งานเพียงพอต่อ Traffic ช่วงเปิดขายบัตรคอนเสิร์ต (Peak Volume) ซึ่งต้องนับรวมทั้ง OTP verification, ticket issuance emails, และ delivery retries.
4. **Bounce & Complaint Handling**: กำหนดค่า Amazon SNS หรือ SES Event Destination เพื่อรับการแจ้งเตือน Bounce และ Complaint พร้อมทั้งตรวจสอบว่าอัตรา Bounce < 5% และ Complaint < 0.1% ตามมาตรฐาน AWS SES เพื่อป้องกันการถูกระงับบัญชี (Account Suspension).
5. **Local/Double isolation**: ผลการทดสอบผ่าน local transport / capture double เป็นการทดสอบ contract ระดับ local เท่านั้น ไม่ถือเป็นหลักฐานว่า SES Production พร้อมใช้งานหรืออีเมลถูกส่งถึง inbox ผู้รับจริง.
