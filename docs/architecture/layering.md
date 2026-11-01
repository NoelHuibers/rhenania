# Server layering (#33)

Where server code lives, how it gets its tenant database, and the order in
which the existing code moves there. Phase 1 (this document, the lint rule,
the explicit script DB), phase 2 (billing and the Getränkekasse), phase 3
(the Fuchsenladen and the mails) and phase 4 (the CC-Kasse and
Mitglieder/Semesterbeitrag) are done; achievements and games come next.

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

`src/server/lib/tenant-scope.ts`. `defineAction` builds the scope once per
call and passes it, with the actor (`Member`), to the handler:
`async ([id], { tenant, user }) => service.doIt(tenant, id)`. Its tenant is
the one the guard checked the caller's membership in: `auth()` reports that
`tenantId` and `requireCaller(roles?)` (`lib/authz.ts`) returns it, so the
scope costs no extra lookup. Plain guarded reads do the same by hand
(`const { tenantId } = await requireCaller(); scopeOf(tenantId)`).
`currentTenantScope()` resolves the request host, for request-bound entry
points that have no guard of their own.

Tests build a scope over the test tenant's file DB with `testScope({ now })`
(`test/harness.ts`), so services run with a fixed clock and without
`vi.setSystemTime` (see `modules/billing/service.test.ts`). Cross-tenant
work (cross-Corps games) builds a second scope explicitly with
`scopeOf(otherId)`.

### Errors

- Services throw typed errors (`NotFoundError`, `ConflictError`,
  `ValidationError`, ... sharing a `DomainError` base with a German,
  user-readable message and a code).
- `defineAction` maps them to `fail(message, code)`; `ActionError` is one
  of them (`src/server/lib/domain-error.ts`). Anything else is logged and
  answered with the generic message.
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
2. **Billing + Getränkekasse** (done, see below).
3. **Fuchsenladen + mails** (done, see below).
4. **CC-Kasse and Mitglieder/Semesterbeitrag** (done, see below).
5. Achievements/tracking and games (the cross-tenant parts need two scopes).
6. The rest (events, profile, drinks, images, venues), then delete the proxy
   and `getCurrentTenantDb`, leaving `TenantScope` as the only way in.

## Phase 2: billing and Getränkekasse (done)

```
src/server/modules/billing/
  repo.ts        bill periods, bills, items, stored CSVs/PDFs; the run's
                 read batch and atomic write batch
  run.ts         the Getränke billing run (service) on domain/billing/plan.ts
  service.ts     bill status changes, period and bill reads, the member's
                 open bill and profile bill, PDF and CSV (+ Blob storage)
  actions.ts     createNewBilling, getAllBillPeriods, getBillsForPeriod,
                 updateBillStatus, saveBillPeriodCSV, getUserBillingData,
                 downloadUserBillPDF
src/server/modules/getraenkekasse/
  repo.ts        bank entries, external bills, kasse_config,
                 getraenke_billing_config, kontos, open-bill sums
  service.ts     Kasse summary and books, payment target and bill sender,
                 drink markup and bill recipient (feature flags)
  actions.ts     the Kasse actions of the Getränkewart page
src/server/domain/billing/csv.ts             the period CSV layout
src/server/domain/getraenkekasse/payment.ts  payment target and sender rules
src/server/loaders/open-bill.ts              the open-bill banner/card
```

- `lib/billing-batch.ts` and `lib/carried-bills.ts` stay shared with the
  Fuchsenladen and take the database they run on.
- Request-bound entry points remain for code outside phase 2:
  `lib/billing-run.ts` (Inventur + Rechnung reads its `{ success }`
  result), `lib/getraenkekasse-payment.ts` (`resolveGetraenkeBillSender`,
  Inventur) and `lib/getraenke-settings.ts` (`getDrinkPricingConfig`:
  orders, menu, challenges). They resolve the scope and call the services.
- Reads that used to answer an outage with `[]` (bill periods, a period's
  bills, the profile's bill, the billing profile) now fail.
- The bill mails moved to `modules/mail` in phase 3.

## Phase 3: Fuchsenladen and mails (done)

```
src/server/modules/fuchsenladen/
  repo.ts        items, orders, bill periods, bills, items of bills,
                 payment details; the run's read batch and atomic write
                 batch; a bill's status change with its orders as one batch
  run.ts         the Fuchsenladen billing run (service) on
                 domain/billing/plan.ts
  service.ts     items (+ Blob pictures), orders, bill status changes,
                 reads, payment details, PDF and CSV
  actions.ts     every Fuchsenladen action: changes are defineActions,
                 page reads are guarded functions that throw
src/server/modules/mail/
  repo.ts        the CC-Kasse's PayPal link
  service.ts     every outgoing mail; the bill mails (Getränke, treasurer,
                 Semesterbeitrag, Mahnung) take the scope they are sent for
src/server/domain/fuchsenladen/bill-pdf.ts   the bill PDF layout
src/server/domain/fuchsenladen/csv.ts        the period CSV layout
```

- `lib/billing-batch.ts` and `lib/carried-bills.ts` stay shared with the
  Getränke billing.
- Reads that used to answer a signed-out caller or an outage with `[]`,
  zero totals or the empty payment details (orders, order summary, bills,
  items, periods) now throw; the pages show their error (#216).
- `actions/fuchsenladen/` and `actions/getUserName.ts` are gone; the
  profile reads its Fuchsenladen cards from the module.
- The Semesterbeitrag (`modules/semesterbeitrag` since phase 4) passes
  its action's scope to the Beitrag and Mahnung mails.
- Known gap: `sendTenantMail` (`lib/mailer.ts`) still picks the sending
  mailbox and From name from the request host (`getCurrentTenant()`), not
  from the scope. Every current caller runs in its tenant's request; a
  caller without one (a cron job) would need the scope passed down.

## Phase 4: CC-Kasse and Mitglieder/Semesterbeitrag (done)

```
src/server/modules/cc-kasse/
  repo.ts        Etatpläne, Kostenpunkte with Positionen (atomic create
                 and replace), Einnahmen, Kostenerstattungen, payment
                 details, the overview's sums
  service.ts     Etatplan, Kostenpunkt, Einnahmen and Erstattung rules
                 (status transitions, receipts in the Corps' folder),
                 payment details, the overview
  excel.ts       the Etatplan workbook: export, and the import's upsert
  actions.ts     every CC-Kasse action
src/server/modules/semesterbeitrag/
  repo.ts        runs, charges, the guarded "Gemahnt" write, the active
                 CC-Kasse account
  service.ts     runs, charges, the invoice and reminder loops, the
                 charge PDF
  actions.ts     every Semesterbeitrag action
src/server/modules/members/
  repo.ts        member rows, the member_status config, the user mirror's
                 emails
  service.ts     the status taxonomy (with defaults), the Adressliste,
                 unambiguous account linking, the caller's own entry,
                 who owes the Semesterbeitrag
  excel.ts       the Adressliste workbook: export and import
  actions.ts     every Adressliste and own-entry action
src/server/domain/cc-kasse/overview.ts            budget overview (pure)
src/server/domain/cc-kasse/etaplan-excel.ts       the EtatplanWS layout
src/server/domain/members/excel-map.ts            the Adressliste columns
src/server/domain/members/statuses.ts             beitragspflichtig matcher
src/server/domain/semesterbeitrag/beitrag-pdf.ts  the Beitrag letter
```

- `actions/cc-kasse/`, `actions/members/` and `lib/member-statuses.ts`
  are gone. Five of those files imported the proxy; the baseline is 24.
- Role sets: `ROLES.etatplan` (Senior, CC-Kasse, Admin), `ROLES.ccKasse`
  (CC-Kasse, Admin) and `ROLES.adressliste` in `lib/authz.ts` replace the
  `_guards.ts` constants. Who may call what is unchanged.
- The page reads keep their old answers. A caller without the right gets
  `[]`/`null` (each `actions.ts` has a local `requireRoles` that maps the
  AuthzError to nothing), and the plan reads (`listEtaplans`,
  `getEtaplanById`, `getActiveEtaplan`, the Kostenpunkt, event and
  overview reads) still log a failed query and answer it with `[]`/`null`.
  Turning those into errors needs an `error.tsx` check on /cc-kasse and
  /kostenerstattung first (#216); the services already throw.
- The tenant's name on the Beitrag PDF and the Etatplan workbook and the
  slug the receipt check uses come from the scope's tenant
  (`getTenantById(tenant.tenantId)`), no longer from the request host.
  The PDF's date and the overdue flags read the scope's clock.
- The Konten (`actions/kontos/kontos.ts`) stay where they are: every
  Kasse's bank accounts, managed per Kasse role, not part of the CC-Kasse
  or the Adressliste. They are already on an explicit scope and belong
  to phase 6.
- The actions name their id parameters (`etaplanId`, `kostenpunktId`,
  `einnahmeId`, `reimbursementId`, `memberId`), so the tenant-isolation
  test passes each a foreign row of the right kind.
- Known gap: `knip --production` reports unused exports only under
  `src/server/actions`, so an action in a module's `actions.ts` that only
  a test calls is not flagged yet.
