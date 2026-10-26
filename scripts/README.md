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
