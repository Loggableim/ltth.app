# Stable overlay routing operations

The authoritative operations runbook is maintained in English in
[`../stable-overlay-routing-operations.md`](../stable-overlay-routing-operations.md).
Use that document for local setup, staging evidence, production approval gates,
DNS migration, canary rollout, rollback, and credential-incident procedures.
It also defines the exact custom staging authorities (with `workers.dev`
disabled), separate staging/production raw-path tokens, fixed Clerk trust,
staged idempotent enrollment, Origin rewriting, proxy-neutral
`Vary: Origin`, exact POST exceptions, and disabled raw Worker logging.
