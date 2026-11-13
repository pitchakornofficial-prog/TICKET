# Repeatable optimization verification

Run from repository root with Node 24, npm 12, existing dependencies and installed Playwright Chromium. Only the existing local `ticket_test` PostgreSQL service is used; the benchmark creates and cleans its own random schema through `authFixture`. It never seeds or deletes development data. External payment/email/storage providers are isolated by the repository test environment.

```sh
docker compose up -d --wait db-test
npm run benchmark:optimizations
node scripts/benchmarks/report.mjs
```

Individual runs:

```sh
npm run benchmark:optimizations -- database
npm run benchmark:optimizations -- browser
```

The browser benchmark takes about 95 seconds because it measures actual timers, not simulated time. In the agent sandbox the same commands require loopback/subprocess access. The harness imports the actual image route into a local HTTP server; separate full E2E tests run the actual Next server and upload/media endpoints. Storage remains the project's local memory provider, not cloud storage.

BEFORE source is read with `git show f623c17:<path>`; this commit is the parent of optimization commit `36801b9`. Keep that Git history available. Temporary baseline TypeScript modules under `.cache/optimization-baseline` only replace relative imports with original source paths and adapt `to_regclass('public.*')` to the isolated test schema. The latter is explicitly recorded to make the quota comparison semantically equivalent. SQL algorithms otherwise remain the baseline. Temporary modules are removed in `finally`.

AFTER is the current working tree. Results overwrite `results/database.json` and `results/browser.json`; both retain raw samples, runtime details, fixture size and time. The report generator produces `RESULTS.md`. Review the diff before retaining a new run. Timing is observational, not a flaky performance pass/fail gate; correctness assertions are strict. For comparison, stop unrelated builds/tests and repeat on the same hardware. Heap deltas are deliberately omitted because GC/noise was not controlled.

These are newly reproducible fixtures, not the unavailable scratch script from the previous report. Concert descriptions are deterministic ASCII (about 1.6 KB each), the poster is generated with seed 42, and order/ticket fixtures are defined in the retained source. Differences from the earlier reported byte counts are expected; compare BEFORE and AFTER within the same retained run. Source hashes identify the measured working-tree modules, including client flows and package manifest.

Independent regression coverage lives in `tests/integration/performance-optimizations.test.ts`, `tests/unit/optimization-regressions.test.ts`, and `tests/e2e/performance-optimizations.spec.ts`, plus the updated existing critical journeys. Full test commands remain `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`.

Known reproduced issues and fixes are recorded in [TASK-046](../tasks/TASK-046-optimization-verification.md). The report distinguishes real HTTP/browser/DB measurements from modeled request rates, provider doubles and production claims.
