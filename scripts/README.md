# scripts/

| Folder | Purpose | Touches data? |
|---|---|---|
| `ops/` | Operational tools: tenant migrations, control seed, granting admins, config backfill | **yes, writes** |
| `diag/` | Read-only diagnostics (`pnpm diag:*`) | reads |
| `dev/` | Local development and E2E: local DBs, seed data, launcher, visual tests | local `.data/` only |
| `ci/` | Checks that run in CI without a database | no |
| `lib/` | Shared helpers for the scripts | – |

Scripts in `ops/` and `diag/` read `.env`, which holds the **production** credentials.
To try one against the local databases instead, run it through the local launcher:

```bash
pnpm db:local:reset
pnpm exec tsx scripts/dev/run.ts pnpm diag:tenant-health hassia
pnpm exec tsx scripts/dev/run.ts pnpm db:migrate-tenants --dry-run
```

## Pending one-off backfills

| Command | Purpose |
|---|---|
| `pnpm db:backfill-billing-profile [--apply]` | #9: copy the formerly hard-coded Getränke bill sender, holder, IBAN and PayPal into Rhenania's tenant DB. Run after `db:migrate-tenants` (0012) and before deploying. Dry run by default; `--apply` needs `CONFIRM_PROD=<host>`. |

## Diagnostics

| Command | What it shows |
|---|---|
| `pnpm diag:tenant-health [slug]` | tenant row, domains, auth config, memberships, row counts |
| `pnpm diag:memberships` | users without any tenant membership |
| `pnpm diag:diff-tables [a] [b]` | table list difference between two tenant DBs |
| `pnpm diag:migration-journal [slug]` | applied tenant migrations vs local journal and file hashes |
| `pnpm diag:control-journal` | applied control migrations vs local journal |
| `pnpm diag:member-statuses [slug]` | distinct `member.status` values |
| `pnpm diag:duplicate-settlements [slug]` | challenges settled more than once (several games per `challengeId`), per Corps and cross-Corps |

## Repairs

Dry run by default; `--apply` writes and needs `CONFIRM_PROD=<db-host>` for a remote DB.

| Command | What it does |
|---|---|
| `pnpm ops:reconcile-user-mirror [slug] [--apply]` | #35: brings each tenant's `user` mirror in line with the control DB (inserts missing members, updates name, e-mail and image; former members' rows stay). Run when the superadmin health table shows user mirror drift. Idempotent; all tenants without a slug. |
| `pnpm ops:repair-fuchsen-carry <slug> [--apply]` | closes Fuchsen bills the old billing carried into a later bill but left open (→ "Übertragen", or "Bezahlt" when the later bill was paid), so the next run doesn't charge them twice; lists carries and bills that need a human look. Run once per tenant before the first Fuchsen billing with the new code. |

## Removed one-off migrations

These ran once against production and were removed. Restore one from git history
if you ever need it again (`git show <commit>:scripts/<name>.ts`).

| Script | Last commit | Purpose |
|---|---|---|
| `migrate-auth.ts`, `fix-auth-fks.ts`, `create-indexes.ts`, `check-fk-state.ts`, `fix-provider-name.ts` | `a39b6f7b`, `1f68a80e`, `147b898e` (2026-03) | NextAuth → Better Auth migration |
| `migrate-identity.ts`, `apply-tenant-drop.ts` | `5230c7a0` (2026-04) | move identity into the control DB |
| `rename-microsoft-accounts.ts` | `eb841509` (2026-04) | per-tenant Microsoft provider IDs |
| `apply-prefix-rename.ts` | `ec31d93c` (2026-04) | drop the `rhenania_` table prefix |
| `apply-control-migration-0005.ts`, `migrate-userstats-to-control.ts` | `c69aed2a` (2026-05) | global ELO in the control DB |
| `repair-hassia-journal.ts` | `0e39e7a6` (2026-07) | fix Hassia's migration journal |
| `repair-orphaned-bill-carryover.ts` | `96650352` (2026-07) | close out bills orphaned by the old carry-over bug (pattern for the Fuchsenladen fix, #12) |
