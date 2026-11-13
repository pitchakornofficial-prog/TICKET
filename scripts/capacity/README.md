# Isolated AWS/Neon purchase capacity experiment

Operational test tooling for the explicitly authorized 2026-11-12 experiment.
This is not a production deployment target or a new public test mode.

- The Dockerfile derives from the release operations image pinned by digest.
  It rebuilds the same optimized Next application after replacing provider-mode
  guards in **only three files inside the image**: OTP, email transport and
  pay-test. Host application source and the live release are unchanged.
- `prepare-image.mjs` is container-only. Never run it in the working tree.
- `boot.mjs` requires `CAPACITY_ISOLATED=true`, a new database name matching
  `capacity_20261112_<8 hex>`, and `STAGING_DATABASE_URL` injected by the existing
  staging ECS execution role. The staging endpoint must first be verified to
  differ from production. It refuses an existing database and provider keys.
  It creates a fresh database in the staging Neon branch, migrates only that
  database, and seeds two synthetic fixture accounts there. It uses the pooled
  endpoint for application traffic and the direct endpoint for initialization.
- The app task uses 0.5 vCPU / 1 GiB and pool maximum 15, matching the observed
  production task configuration. The driver runs separately on 1 vCPU / 2 GiB.
  The dedicated security group permits port 3000 only from itself; neither
  task is registered with the customer-facing ALB. No public ingress is added.
- No Stripe/SES/R2 keys or task IAM role are provided to the app or driver.
  Test payments and email capture run entirely in memory. OTPs are not logged.
  Live payment mode is asserted false by the driver before every payment.
- The driver measures closed-loop concurrent **complete server journeys**:
  queue → OTP request/verification → reservation → payment QR → double-backed
  payment success → issued tickets. Each synthetic buyer has a distinct test
  client IP. Human OTP entry and banking time, browser assets, Cloudflare/ALB,
  real provider throughput and multiple app instances are not measured.
- Exploratory pass criterion: zero unexpected errors, complete unique tickets,
  sold-out rejection and journey p95 ≤ 5 seconds. This is an experiment criterion,
  not a newly confirmed product SLO. The initial sweep uses 3 orders per worker
  (minimum 100), followed by two midpoint probes after the first failing level.
  Sustained runs used an isolated copy of the driver with the multiplier changed
  to 30 and stages restricted to the boundary levels, recorded in ECS overrides.
- Fleet experiments used four app tasks sharing the same isolated database.
  Synthetic buyers stay on one app instance for their complete journey because
  the payment double keeps intents in process memory. Administrative setup is
  pinned to the primary test task. This is a capacity experiment with doubles,
  not a proof of random ALB routing, shared gateway state or cross-node auth.
  Additional app tasks join the existing test database with guarded overrides;
  they do not rerun database creation or fixture seeding. No fleet task is added
  to the customer service or ALB. Sustained results take precedence over brief
  sweeps: the latter can look better after warm-up or during resource changes.
- App lifetime is capped at 30 minutes. Stop the task after audit; completed
  driver tasks exit themselves. The database is retained for review: no automatic
  DROP/DELETE cleanup is implemented. Database deletion requires explicit user
  authorization under AGENTS.md. Task definitions/images may be retained without
  running compute. The deployment document records actual resource IDs/results.

Build (no application secrets in the build context):

```sh
docker build --platform linux/arm64 -f scripts/capacity/Dockerfile -t ticket-capacity:20261112 .
```

Never put this image in the `ticket-production` stack or point it at the
production database. The experiment's database, task definitions and security
group must be positively identified before reuse; a name alone is not evidence
of isolation. Read the dated results in `docs/deployment.md` before interpreting
the benchmark or changing a live queue limit.
