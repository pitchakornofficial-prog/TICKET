# Optimization verification — changed files

This continuation started on 2026-11-15 from clean revision `6ca49ae`. Earlier optimization and verification changes were already in `36801b9` and `fec9ace`; the later cache/security/integrity commits are preserved. The list below identifies this continuation's changes, not unrelated changes made by those commits.

## Application

- [src/server/cache.ts](../../src/server/cache.ts): immediate tag expiry after successful mutations while retaining tagged caching between mutations.
- [src/app/api/events/[id]/route.ts](../../src/app/api/events/%5Bid%5D/route.ts): invalidate approved event edits and reverting events to draft.
- [src/app/api/owner/news/route.ts](../../src/app/api/owner/news/route.ts) and [src/app/api/owner/news/[id]/route.ts](../../src/app/api/owner/news/%5Bid%5D/route.ts): invalidate direct publication and deletion.
- [src/app/api/owner/sessions/amendments/[id]/approve/route.ts](../../src/app/api/owner/sessions/amendments/%5Bid%5D/approve/route.ts), [cancellations/[id]/approve/route.ts](../../src/app/api/owner/sessions/cancellations/%5Bid%5D/approve/route.ts), and [sessions/[id]/special-refund-window/route.ts](../../src/app/api/owner/sessions/%5Bid%5D/special-refund-window/route.ts): invalidate after successful public session mutations.
- [src/server/events.ts](../../src/server/events.ts): count scanner quota against the actual primary-scanner table while retaining the per-event transaction lock.
- [src/server/reports.ts](../../src/server/reports.ts): initialize schema on a pool and read payout reports through the existing transaction client without reconnecting.
- [src/server/image-variants.ts](../../src/server/image-variants.ts): restore requested public-image resizing/encoding with bounded cache and duplicate-work coalescing.
- [src/app/api/media/[...key]/route.ts](../../src/app/api/media/[...key]/route.ts): retain original streaming, validate decoded path components, support existing encoded-key URLs, use representation-specific ETags, and keep proofs private/no-store/untransformed.

## Tests and fixtures

- [tests/unit/public-cache-invalidation.test.ts](../../tests/unit/public-cache-invalidation.test.ts): immediate expiry and successful-publication ordering, with no eviction for drafts, failed writes or unauthorized callers. Existing reschedule/news E2Es reproduce the public freshness regressions.
- [tests/unit/image-variants-route.test.ts](../../tests/unit/image-variants-route.test.ts): real encoder coverage for encoded URLs, conditional ETags, streams and proof privacy.
- [tests/unit/storage.test.ts](../../tests/unit/storage.test.ts): provide the required typed test environment field.
- [tests/integration/weekly-manual-payout.test.ts](../../tests/integration/weekly-manual-payout.test.ts): store proof fixtures under the permitted `proofs/` prefix.
- [tests/integration/ticket-email-delivery.test.ts](../../tests/integration/ticket-email-delivery.test.ts): distinguish escaped HTML URLs from raw plaintext links while retaining token-gated access assertions.
- [tests/support/event-draft.ts](../../tests/support/event-draft.ts): explicit real organizer refresh after fixture changes from APIs/another context.
- [tests/e2e/weekly-manual-payout.spec.ts](../../tests/e2e/weekly-manual-payout.spec.ts) and [organizer-money-report.spec.ts](../../tests/e2e/organizer-money-report.spec.ts): use that refresh before opening the report; monetary, export and privacy assertions remain intact.
- [tests/e2e/manual-refund-proof.spec.ts](../../tests/e2e/manual-refund-proof.spec.ts): use normal actionable clicks instead of forced clicks while the mobile page is still scrolling. The trace proved no approval POST was sent; HTTP success, monetary and proof-privacy assertions remain intact.

## Repeatable evidence

- [scripts/benchmarks/browser.mjs](../../scripts/benchmarks/browser.mjs): permitted poster fixture keys and provenance for the restored variant helper.
- [tests/benchmarks/browser.bench.test.ts](../../tests/benchmarks/browser.bench.test.ts): permitted poster prefix in overwrite/cache regression.
- [RESULTS.md](RESULTS.md), [browser.json](results/browser.json), [database.json](results/database.json): refreshed BEFORE/AFTER measurements and raw samples.
- [TASK-046](../tasks/TASK-046-optimization-verification.md): authoritative verification history and final review status.

Generated Next route declarations may change while test/build tools run; they are not a manually implemented application change. No commit or push is performed by this continuation.
