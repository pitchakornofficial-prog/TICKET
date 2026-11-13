import { readFile, writeFile } from 'node:fs/promises';

const database = JSON.parse(await readFile('docs/benchmarks/results/database.json', 'utf8'));
const browser = JSON.parse(await readFile('docs/benchmarks/results/browser.json', 'utf8'));
const fmt = value => value.toFixed(2);
const rows = Object.entries(database.pairs).map(([name, pair]) =>
  `| ${name} | ${fmt(pair.before.p95Ms)} → ${fmt(pair.after.p95Ms)} ms | ${pair.before.queries[0]} → ${pair.after.queries[0]} | ${pair.before.payloadBytes.toLocaleString('en-US')} → ${pair.after.payloadBytes.toLocaleString('en-US')} |`);
const imageRows = Object.entries(browser.images).map(([format, result]) =>
  `| ${format} | ${result.bytes.toLocaleString('en-US')} | ${fmt(result.cold.p95Ms)} ms | ${fmt(result.warm.p95Ms)} ms |`);
const pollingRows = Object.entries(browser.polling).map(([name, result]) =>
  `| ${name} | ${result.requests} / ${fmt(result.durationMs / 1000)} s | ${fmt(result.observedRequestsPerSecond)} | ${result.maxConcurrent} |`);
await writeFile('docs/benchmarks/RESULTS.md', `# Independent local BEFORE / AFTER results

Generated from retained JSON samples by \`node scripts/benchmarks/report.mjs\`.
DB measured: ${database.measuredAt}; browser measured: ${browser.measuredAt}.
Node ${database.node}; ${database.postgres}; Chromium ${browser.environment.browser}.
Baseline commit: \`${database.baselineRef}\` (parent of optimization \`36801b9\`).

## PostgreSQL

30 concerts × 4 sessions × 3 types, 500 orders / 1,500 tickets on one concert, 50 refunded tickets. Five warmups + 30 alternating paired samples. Warm schema initialization excluded. Times are server function times; payload bytes are serialized bodies (Finance Hub sums its separate response bodies). No HTTP headers/compression/React rendering included.

| Flow | p95 BEFORE → AFTER | SQL queries BEFORE → AFTER | Body bytes BEFORE → AFTER |
|---|---:|---:|---:|
${rows.join('\n')}

Baseline adapter: ${database.baselineAdapter}
Financial assertions: gross 1,200,000; net 1,160,000; organizer fee 58,000; entitlement 1,102,000; held reserve 110,200; payable 991,800. All numeric report fields and complete order details agree with baseline. Full/summary/paged/batch modes also have independent PostgreSQL regression tests. Current and schema-adapted baseline detail quotas agree (8,550 remaining). Description-only search returns exactly the expected concert without transmitting description.

Catalog now performs two queries (items and location facets), versus one legacy list query; the benefit is reduced response data, not fewer SQL queries. Details latency must be read from the measurements, not inferred from query count.

## Native Chromium offline admission

5,000 tickets, 5 warmups + 30 sequential alternating entry/exit scans per implementation. Browser \`performance.now()\`, actual localStorage BEFORE and native IndexedDB AFTER; no IndexedDB mock. Each sample includes log persistence/transaction completion. The two implementations are measured in separate phases, so cache/order bias remains possible.

| Metric | BEFORE | AFTER |
|---|---:|---:|
| Scan p95 | ${fmt(browser.offline.before.p95Ms)} ms | ${fmt(browser.offline.after.p95Ms)} ms |

Initial IndexedDB snapshot save: ${fmt(browser.offline.saveMs)} ms (not part of scan timing). Native reload persistence, replacement of a snapshot, refusal to replace unsynced states, and transaction-abort rollback are checked. Reload is checked within the same browser context; this is not an OS crash/power-loss durability claim.

## Polling over actual loopback HTTP

Real poller implementation and real browser timers/fetch. Baseline reproduces fixed 2.5-second scheduling; adaptive harness uses 3-second base with jitter disabled to make timings interpretable. Healthy response delay 100 ms; slow response delay 3 seconds; backoff endpoint returns 503. These are controlled HTTP fixtures, not a 1,000-user load test or exact payment/queue business endpoint timings. Counters include the initial request; short-window request rates do not equal steady-state theoretical rates.

| Scenario | Measured requests / window | Requests/s | Max browser requests in flight |
|---|---:|---:|---:|
${pollingRows.join('\n')}

Visibility/terminal-stop behavior has separate browser/unit regression tests. Attempts to produce actual background visibility using another Chromium window and minimization still reported \`visible\` in this environment; no real hidden-tab throughput measurement is claimed. The earlier 1,000-tab/hidden-tab numbers were calculated estimates, not independently measured capacity.

## Image HTTP cold / warm cache

Deterministic seeded noisy 1600×2200 JPEG; actual media GET handler, real sharp and loopback HTTP. Public storage uses the configured local MemoryStorageDouble, not R2. Eight different keys per format ensure cold variants; a second request per key measures warm server cache. No browser/CDN cache. p95 with eight samples is the largest sample and has limited statistical confidence.

| Variant | Body bytes | Cold HTTP p95 | Warm HTTP p95 |
|---|---:|---:|---:|
${imageRows.join('\n')}

Resize outputs are decoded and checked at 360px. AVIF encoding has substantial cold CPU/latency cost and is not guaranteed to be smaller than WebP. Warm responses still read/hash source data; no reduction in R2-to-server egress is established. Separate E2E tests use the real Next server's upload/media endpoints and enforce private-file denial.

Raw samples: [database.json](results/database.json), [browser.json](results/browser.json). See [README](README.md) for exact repeat commands and limits. These local synthetic results do not certify production capacity, network performance, or provider readiness.
`);
