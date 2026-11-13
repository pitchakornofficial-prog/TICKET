# Independent local BEFORE / AFTER results

Generated from retained JSON samples by `node scripts/benchmarks/report.mjs`.
DB measured: 2026-11-13T04:03:25.911Z; browser measured: 2026-11-13T04:00:31.643Z.
Node v24.20.0; PostgreSQL 18.6 (Debian 18.6-1.pgdg12+2) on aarch64-unknown-linux-gnu, compiled by gcc (Debian 12.2.0-14+deb12u1) 12.2.0, 64-bit; Chromium 156.0.8078.4.
Baseline commit: `f623c17` (parent of optimization `36801b9`).

## PostgreSQL

30 concerts × 4 sessions × 3 types, 500 orders / 1,500 tickets on one concert, 50 refunded tickets. Five warmups + 30 alternating paired samples. Warm schema initialization excluded. Times are server function times; payload bytes are serialized bodies (Finance Hub sums its separate response bodies). No HTTP headers/compression/React rendering included.

| Flow | p95 BEFORE → AFTER | SQL queries BEFORE → AFTER | Body bytes BEFORE → AFTER |
|---|---:|---:|---:|
| financeHub | 126.05 → 5.38 ms | 301 → 6 | 276,351 → 31,189 |
| moneySummary | 18.75 → 5.76 ms | 10 → 6 | 197,394 → 2,109 |
| moneyPage20 | 19.73 → 7.24 ms | 10 → 7 | 197,394 → 9,990 |
| eventDetails | 14.07 → 2.75 ms | 7 → 4 | 5,211 → 5,211 |
| catalog | 1.88 → 2.92 ms | 1 → 2 | 60,707 → 3,860 |

Baseline adapter: Only to_regclass public qualification is removed from baseline events module to honor isolated test search_path. SQL algorithms otherwise unmodified; both details paths now include held/refunded counts.
Financial assertions: gross 1,200,000; net 1,160,000; organizer fee 58,000; entitlement 1,102,000; held reserve 110,200; payable 991,800. All numeric report fields and complete order details agree with baseline. Full/summary/paged/batch modes also have independent PostgreSQL regression tests. Current and schema-adapted baseline detail quotas agree (8,550 remaining). Description-only search returns exactly the expected concert without transmitting description.

Catalog now performs two queries (items and location facets), versus one legacy list query; the benefit is reduced response data, not fewer SQL queries. Details latency must be read from the measurements, not inferred from query count.

## Native Chromium offline admission

5,000 tickets, 5 warmups + 30 sequential alternating entry/exit scans per implementation. Browser `performance.now()`, actual localStorage BEFORE and native IndexedDB AFTER; no IndexedDB mock. Each sample includes log persistence/transaction completion. The two implementations are measured in separate phases, so cache/order bias remains possible.

| Metric | BEFORE | AFTER |
|---|---:|---:|
| Scan p95 | 5.30 ms | 0.40 ms |

Initial IndexedDB snapshot save: 153.40 ms (not part of scan timing). Native reload persistence, replacement of a snapshot, refusal to replace unsynced states, and transaction-abort rollback are checked. Reload is checked within the same browser context; this is not an OS crash/power-loss durability claim.

## Polling over actual loopback HTTP

Real poller implementation and real browser timers/fetch. Baseline reproduces fixed 2.5-second scheduling; adaptive harness uses 3-second base with jitter disabled to make timings interpretable. Healthy response delay 100 ms; slow response delay 3 seconds; backoff endpoint returns 503. These are controlled HTTP fixtures, not a 1,000-user load test or exact payment/queue business endpoint timings. Counters include the initial request; short-window request rates do not equal steady-state theoretical rates.

| Scenario | Measured requests / window | Requests/s | Max browser requests in flight |
|---|---:|---:|---:|
| before | 6 / 13.00 s | 0.46 | 1 |
| after | 5 / 13.01 s | 0.38 | 1 |
| slowBefore | 6 / 13.01 s | 0.46 | 2 |
| slowAfter | 3 / 13.02 s | 0.23 | 1 |
| backoffAfter | 3 / 18.00 s | 0.17 | 1 |

Visibility/terminal-stop behavior has separate browser/unit regression tests. Attempts to produce actual background visibility using another Chromium window and minimization still reported `visible` in this environment; no real hidden-tab throughput measurement is claimed. The earlier 1,000-tab/hidden-tab numbers were calculated estimates, not independently measured capacity.

## Image HTTP cold / warm cache

Deterministic seeded noisy 1600×2200 JPEG; actual media GET handler, real sharp and loopback HTTP. Public storage uses the configured local MemoryStorageDouble, not R2. Eight different keys per format ensure cold variants; a second request per key measures warm server cache. No browser/CDN cache. p95 with eight samples is the largest sample and has limited statistical confidence.

| Variant | Body bytes | Cold HTTP p95 | Warm HTTP p95 |
|---|---:|---:|---:|
| original | 2,510,085 | 32.93 ms | 12.06 ms |
| webp | 52,002 | 54.43 ms | 2.81 ms |
| avif | 57,251 | 300.28 ms | 3.22 ms |

Resize outputs are decoded and checked at 360px. AVIF encoding has substantial cold CPU/latency cost and is not guaranteed to be smaller than WebP. Warm responses still read/hash source data; no reduction in R2-to-server egress is established. Separate E2E tests use the real Next server's upload/media endpoints and enforce private-file denial.

Raw samples: [database.json](results/database.json), [browser.json](results/browser.json). See [README](README.md) for exact repeat commands and limits. These local synthetic results do not certify production capacity, network performance, or provider readiness.
