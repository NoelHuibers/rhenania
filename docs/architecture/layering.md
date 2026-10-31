# Server layering (#33)

Where server code lives, how it gets its tenant database, and the order in
which the existing code moves there. Phase 1 (this document, the lint rule,
the explicit script DB) is done; billing and the Getränkekasse come next.

## Why

Action files today mix input parsing, auth, business rules, raw Drizzle,
cross-DB writes, `revalidatePath` and error swallowing. They get their
database in three ways: the implicit proxy `db` from `~/server/db`,
`getCurrentTenantDb()` and `getTenantDb(id)`. The proxy hides which tenant a
query hits (the root of the cross-tenant challenge bugs), and errors turned
into `[]`/`false` make an outage look like "no bills".

## Target layout

```
src/server/modules/<domain>/
  actions.ts   "use server": defineAction (zod args + roles/feature), then one
               service call. No Drizzle, no business rules.
  service.ts   Domain rules. Takes { tenant: TenantScope, actor } plus plain
               arguments; throws typed errors; returns plain data.
  repo.ts      Drizzle queries and writes. Takes a TenantDb (or the scope);
               no auth, no rules, no revalidatePath.
  schema.ts    This domain's tables, re-exported from src/server/db/schema.ts
               so drizzle-kit and existing imports keep working.
```

Pure calculations that need no database stay in `src/server/domain/<domain>/`
(e.g. `domain/billing/plan.ts`); the service calls them.

Page data comes from `src/server/loaders/<page>.ts`: the page's role gate
(`requirePageRoles`) and the reads it renders. Pages and components never
import a database module (see "Rules").

### TenantScope

```ts
type TenantScope = {
  tenantId: string;
  db: TenantDb;        // from getTenantDb(tenantId), never the proxy
  now: () => Date;     // injectable clock for time-dependent rules
};
```

`defineAction` builds the scope once per call from the request host and
passes it, with the actor (`Member`), to the handler. Tests build one from a
local libSQL file DB and a fixed clock, so services are tested without
`next/headers` mocks. Cross-tenant work (cross-Corps games) builds a second
scope explicitly with `getTenantDb(otherId)`.

### Errors

- Services throw typed errors (`NotFoundError`, `ConflictError`,
  `ValidationError`, ... sharing a `DomainError` base with a German,
  user-readable message and a code).
- `defineAction` maps them to `fail(message)`, like `ActionError` today.
  Anything else is logged and answered with the generic message.
- Nothing returns `[]`, `null` or `false` to hide a failed query. A read
  that may legitimately find nothing returns `null`/`[]` from the repo; an
  infrastructure error propagates.

## Rules (enforced)

- **No DB in `src/app`, `src/components`, `src/hooks`.** Biome
  `noRestrictedImports` bans `~/server/db` and every `~/server/db/*` module
  except `schema` and `control-schema` (tables carry no connection, and
  Biome can't restrict an import to `import type`). Route handlers under
  `src/app/api` follow the same rule; their reads live in loaders too
  (`loaders/calendar.ts`).
- **No implicit production fallback.** Outside a request the proxy `db`
  throws `NoDbContextError`. Scripts name their database:
  `getScriptDb()` from `~/server/db/script`, or `runWithScriptDb(fn)` when
  they call app code still built on the proxy. Importing a db module opens
  no connection.
- **The proxy only shrinks.** `pnpm proxy-db:check` (CI lint job) prints the
  files that still import the proxy and fails if the count rises above
  `scripts/ci/proxy-db-baseline.json`. After moving files off the proxy, run
  `pnpm proxy-db:baseline` and commit the lower number. When it reaches 0,
  delete the proxy.

## Migration order

One domain per PR, each PR leaving behaviour, query counts (the
`countQueries` tests) and rendered output unchanged:

1. **Foundation** (done): explicit script DB, no fallback, lint rule, page
   loaders, import-count ratchet, this document.
2. **Billing + Getränkekasse** (phase 2, see below).
3. Fuchsenladen (shares the billing plan and runs).
4. CC-Kasse and Mitglieder/Semesterbeitrag.
5. Achievements/tracking and games (the cross-tenant parts need two scopes).
6. The rest (events, profile, drinks, images, venues), then delete the proxy
   and `getCurrentTenantDb`, leaving `TenantScope` as the only way in.

## Phase 2: billing and Getränkekasse

Scope: `src/server/actions/billings/*`, `src/server/actions/getraenkewart/kasse.ts`,
`src/server/actions/profile/getUserBill.ts` and the libs they lean on
(`billing-run`, `billing-batch`, `carried-bills`, `open-bill`,
`getraenkekasse-payment`, `getraenke-settings`).

1. Add `TenantScope` (`src/server/lib/tenant-scope.ts`) and let
   `defineAction` pass `{ tenant, user }`; add `DomainError` and its
   mapping. Existing actions keep working unchanged.
2. `modules/billing/repo.ts`: move the queries of `billing-run.ts`,
   `billing-batch.ts`, `carried-bills.ts` and `open-bill.ts` behind functions
   taking a `TenantDb`; `billing-batch` gets the client from the scope
   instead of the proxy `client`.
3. `modules/billing/service.ts`: the Getränke and Fuchsen runs (today
   `billing-run.ts`) on top of `domain/billing/plan.ts`; bill status changes;
   the per-bill reads that are N+1 today become one query.
4. `modules/billing/actions.ts`: `createNewBilling`, `updateBillStatus`,
   period and bill reads, CSV/PDF export; the old files re-export from it
   until the callers are switched, then go away.
5. `modules/getraenkekasse/{repo,service,actions}.ts` from `kasse.ts`,
   `getraenkekasse-payment.ts` and `getraenke-settings.ts`.
6. Service tests against a local libSQL file DB with a fixed `now`; the
   existing characterisation and query-count tests stay green throughout.
