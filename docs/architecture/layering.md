# Server layering (#33)

Where server code lives, how it gets its tenant database, and the order in
which the existing code moved there. All six phases are done: phase 1 (this
document, the lint rule, the explicit script DB), phase 2 (billing and the
Getränkekasse), phase 3 (the Fuchsenladen and the mails), phase 4 (the
CC-Kasse and Mitglieder/Semesterbeitrag), phase 5 (achievements and games)
and phase 6 (the rest; the implicit proxy `db` and `getCurrentTenantDb` are
gone, a `TenantScope` is the only way into a tenant's data).

## Why

Action files used to mix input parsing, auth, business rules, raw Drizzle,
cross-DB writes, `revalidatePath` and error swallowing. They got their
database in three ways: the implicit proxy `db` from `~/server/db`,
`getCurrentTenantDb()` and `getTenantDb(id)`. The proxy hid which tenant a
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
- **A TenantScope is the only way in.** There is no implicit tenant `db`:
  Biome `noRestrictedImports` refuses `~/server/db` and `~/server/db/index`
  everywhere, and `getCurrentTenantDb` from `~/server/db/tenants`. App code
  takes the scope `defineAction` built, `scopeOf(tenantId)` with the
  guard's tenant (`requireCaller`, the session) or, for request-bound
  entry points without a guard of their own (the public website, the
  Literboard), `currentTenantScope()`.
- **No implicit production fallback.** Outside a request
  `currentTenantScope()` throws. Scripts name their database:
  `getScriptDb()` from `~/server/db/script`, and `tenantScope(id, db)` when
  they call services. Importing a db module opens no connection.

## Migration order

One domain per PR, each PR leaving behaviour, query counts (the
`countQueries` tests) and rendered output unchanged:

1. **Foundation** (done): explicit script DB, no fallback, lint rule, page
   loaders, import-count ratchet (removed with the proxy), this document.
2. **Billing + Getränkekasse** (done, see below).
3. **Fuchsenladen + mails** (done, see below).
4. **CC-Kasse and Mitglieder/Semesterbeitrag** (done, see below).
5. **Achievements/tracking and games** (done, see below).
6. **The rest** (done, see below): the Semesterprogramm, drinks, orders,
   the Inventur and the drink leaderboard, profile, preferences, images,
   roles and Konten; then the proxy and `getCurrentTenantDb` were deleted,
   leaving `TenantScope` as the only way in.

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
  `lib/billing-run.ts` (Inventur + Rechnung; a refused run throws its
  DomainError), `lib/getraenkekasse-payment.ts` (`resolveGetraenkeBillSender`,
  Inventur) and `lib/getraenke-settings.ts` (`getDrinkPricingConfig`:
  orders, menu, challenges). They resolve the scope and call the services.
  `lib/getraenke-settings.ts` is gone since phase 6: its callers ask
  `drinkPricing` with their own scope.
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
  to phase 6 (`modules/konten` since then).
- The actions name their id parameters (`etaplanId`, `kostenpunktId`,
  `einnahmeId`, `reimbursementId`, `memberId`), so the tenant-isolation
  test passes each a foreign row of the right kind.
- `knip --production` reported unused exports only under
  `src/server/actions`; since #239 it checks the modules' `actions.ts`
  too.

## Phase 5: achievements and games (done)

### Achievements

```
src/server/modules/achievements/
  repo.ts        the catalogue with a user's unlocks and progress, the
                 statistics the rules read (one tenant batch, one control
                 batch for cross-Corps games), the progress and unlock
                 batch, the history the recalculation reads, the profile's
                 lists and unlock counts
  tracking.ts    checkAndUnlockAchievements (live events) and
                 recalculateAllAchievements (the seed)
  service.ts     the profile's achievement list, unlock percentages, the
                 Corps' founding day
  actions.ts     getUserAchievements
src/server/domain/achievements/rules.ts   the rules per event, the
                                          recalculation's history helpers
```

- Tracking takes the scope of the Corps whose achievements move:
  `checkAndUnlockAchievements(tenant, userId, event, context?)`. The
  actions that cause an event (orders, the avatar, new accounts, games)
  pass their own scope; a cross-Corps game tracks each player in the
  Corps they played for, with one explicit scope per Corps. The
  `{ tenantId }` option and the fallback to the request host (and, in the
  seed, to every cross-Corps game of the user) are gone.
- Tracking still never throws; a failure is logged. The rules read the
  scope's clock, the founding day comes from the scope's tenant.
- `actions/achievements/`, `actions/profile/achievements.ts` and
  `lib/achievement-stats.ts` are gone. Four of those files (with
  `lib/achievements/version1.ts`, whose `seedAchievements` now takes the
  database) imported the proxy; the baseline is 20.
- `pnpm db:seed <tenant-id or slug>` looks the tenant up in the control DB
  and seeds that tenant's own database (a remote one needs CONFIRM_PROD),
  so the cross-Corps games and the founding day always match the DB being
  written. It runs with the `react-server` condition, so it can import the
  services (`server-only`). Nothing calls `runWithScriptDb` any more; it
  goes with the proxy.
- The query budgets are unchanged: one event costs at most three round
  trips (`tracking-queries.test.ts`), the profile page's count stays.

### Games

```
src/server/modules/games/
  repo.ts              the Corps' DB: challenges (guarded status moves, the
                       claim, the settlement batch, the sweep), played
                       games, the members and ELO preferences the
                       Eloranking and the challenge form read, the ELO
                       card's fallback and history
  cross-corps-repo.ts  the control DB: cross-Corps challenges and games,
                       memberships and Corps, the unified ELO rows
  service.ts           intra-Corps challenges (create to settle, sweep,
                       feed), recent games, the leaderboard, member lists,
                       the profile's ELO card
  cross-corps.ts       cross-Corps challenges on two scopes, discovery,
                       the global leaderboard and peak
  actions.ts           every game action
src/server/domain/games/challenges.ts   deadlines, who pays, the feeds
src/server/loaders/elo-stats.ts         the ELO card of /profile
```

- A cross-Corps challenge never touches the request's tenant implicitly.
  The challenger plays for the scope `defineAction` built (the Corps they
  are signed in to); the opponent's ELO preference is read through
  `scopeOf(opponentTenantId)`, opened only after the membership check;
  settling opens `scopeOf(challengerTenantId)` and
  `scopeOf(opponentTenantId)` and tracks each player's achievements in
  their own Corps. A Corps whose DB is unavailable answers "no ELO" or
  is skipped by the tracking, as before. `listChallengeableTenants`
  excludes the caller's Corps by the guard's tenant, no longer by the
  request host.
- The deadlines and the sweeps read the scope's clock.
- `actions/game/` and `lib/elo-stats.ts` are gone; three of them
  imported the proxy, the baseline is 17. `lib/user-stats.ts` (the
  unified ELO in the control DB), `lib/elo.ts` (the rating maths) and
  `lib/elo-preference.ts` stay shared in `lib`.
- The reads keep their old answers: the feeds, the challengeable Corps
  and members are empty for a signed-out caller (`requireRoles` in
  `actions.ts` maps the AuthzError to nothing), `getAllUsers*` throw
  "Unauthorized", and `getRecentGames`/`getLeaderboard` still log a
  failed query and answer `[]`. Their query counts are unchanged too:
  `recentGames` still reads names and preferences per game, a known
  N+1 left for its own fix.
- The drink leaderboard (`actions/leaderboard/`) is not a game: it ranks
  litres ordered and charts consumption per drink, from orders and drinks
  only. It moves with the drinks and orders in phase 6.

## Phase 6: the rest (done)

### Semesterprogramm

```
src/server/modules/events/
  repo.ts        events, RSVPs (the capacity-checked yes as one
                 statement), recurring templates, venues, the semester
                 config, calendar feed tokens, what the PDF reads
  service.ts     event lists and changes, the RSVP rules (cancelled,
                 deadline, attendee limit), templates and their generated
                 events, venues (unique short name), the semester config,
                 the calendar feeds, the PDF's data
  actions.ts     every Semesterprogramm action
src/server/domain/events/recurrence.ts   the dates a template stands for
src/server/domain/events/sempro.ts       the PDF's data, leaders by rank,
                                         rule texts, the semester's end
src/server/domain/events/sempro-pdf.tsx  the PDF layout
src/server/loaders/sempro.ts             the PDF route's read
```

- `actions/events/`, `actions/semesterprogramm/`, `actions/venues.ts` and
  `src/server/sempro/` are gone. Six of those files imported the proxy;
  the baseline is 11.
- The guarded reads use the guard's tenant (`requireCaller`), the public
  website reads (`getPublicUpcomingEvents`, `getPublicPastEvents`) the
  request host (`currentTenantScope`). `getOrCreateCalendarToken` and
  `getUserRsvpsForEvents` take the session's tenant instead of the host.
  The PDF route passes its session's tenant to `loadSemproPdf`; the
  calendar feeds (`loaders/calendar.ts`) read through the service.
- The reads keep their old answers: the event and template lists log a
  failed query and answer `[]`, a signed-out caller gets no RSVPs and no
  feed token, the public lists need no session. A duplicate venue short
  name is a `ConflictError` with the old message and code.
- The id parameters are named (`eventId`, `recurringEventId`, `venueId`),
  so the tenant-isolation test passes each a foreign row of the right
  kind.
- "Now" (upcoming and past events, the RSVP deadline, the generated
  range, a feed token's last use) is the scope's clock.
- `rotateCalendarToken` has no UI yet; it is marked `@public` for knip
  instead of the old file-wide ignore.

### Drinks, orders and the Inventur

```
src/server/modules/drinks/
  repo.ts        the catalogue, the menu's reads with what was ordered of
                 each drink, a member's most ordered drinks
  service.ts     catalogue changes (Blob pictures, a drink in use can't be
                 deleted), the menu, the recent drinks of /trinken
  actions.ts     the catalogue and menu actions
src/server/modules/orders/
  repo.ts        booking an order, a member's order pages (one batch), the
                 unbilled orders, the Literboard's sums
  service.ts     booking (server-side price, Admin and Faxe rules), the
                 profile's orders, the Rechnungen page's open orders, the
                 Literboard
  actions.ts     createOrder, getMyOrdersPage, getCurrentOrders
src/server/modules/inventur/
  repo.ts        inventories and their items, on the DB or an open
                 transaction, with what they read of drinks, orders,
                 events and the CC-Kasse
  service.ts     the stock overview, counting and closing (one
                 transaction), quick saves, the history with the markup
                 profit, the Veranstaltungs-Inventur
  actions.ts     every Inventur action
src/server/domain/orders/open-orders.ts   unbilled orders per member and
                                          account
src/server/domain/orders/consumption.ts   the Literboard's months, chart
                                          and change in percent
src/server/loaders/recent-drinks.ts       "Zuletzt bestellt" on /trinken
src/server/loaders/leaderboard.ts         the Literboard
```

- `actions/{drinks,menu,orders,currentOrders}.ts`, `actions/inventur/`,
  `actions/leaderboard/`, `lib/recent-drinks.ts` and
  `lib/getraenke-settings.ts` are gone. Five of them imported the proxy;
  the baseline is 6.
- The Literboard page has no guard of its own (the middleware sends
  signed-out visitors away), so its loader uses the request's tenant
  (`currentTenantScope`), as the proxy did. Its windows stay relative to
  SQLite's clock (`unixepoch('now')`); the consumption chart's months
  come from the scope's clock.
- "Inventur + Rechnung" still checks the bill sender through
  `lib/getraenkekasse-payment.ts` and runs the billing through
  `lib/billing-run.ts`, unchanged, so its queries and its failure
  messages stay the same. The markup feature of the Inventur reads is
  still checked with `hasFeature` before the scope's queries.
- The reads keep their old answers: `getDrinks` logs a failed read and
  answers `[]`, the menu reads and `getStockData` throw,
  `getCurrentOrders` logs and throws "Failed to fetch current orders".
  The query counts are unchanged (`count-queries`, `page-queries`,
  `rechnungen-queries`, the order page's batch).
- The drink actions name their id parameter `drinkId`.

### Profiles, preferences, pictures, members and Konten

```
src/server/modules/profile/
  repo.ts          the member's mirror row and roles, what a public
                   profile reads (achievements, litres)
  service.ts       the own profile, renaming and the Microsoft sync (on the
                   global identity), another member's public profile
  actions.ts       getUserProfile, updateUserName, syncFromMicrosoft,
                   refreshProfile, getPublicProfile
src/server/modules/preferences/
  repo.ts          stored values per user and key
  service.ts       the profile's switches, the public profile and ELO
                   opt-outs (lib/elo-preference.ts), the hidden event types
  actions.ts       the caller's own preferences
src/server/modules/images/
  repo.ts          the website's pictures
  service.ts       the public reads, the Fotowart's changes (Blob files,
                   single-picture sections)
  actions.ts       the public reads and the Fotowart's actions
src/server/modules/users/
  repo.ts          members with roles, role assignments, a member's data
                   in this Corps
  control-repo.ts  identities and memberships in the control DB
  service.ts       the Admin page: roles, renaming, removing a member
  actions.ts       the Admin page's actions, getUserRoles, hasAnyRole
src/server/modules/konten/
  repo.ts, service.ts, actions.ts   the Kassen's bank accounts
src/server/loaders/preferences.ts   the profile's switches and ELO opt-out
```

- `lib/preferences.ts`, `actions/profile/{profile,public-profile,preferences}.ts`,
  `actions/bilder/`, `actions/kontos/` and `actions/admin/{admin,userRoles}.ts`
  are gone. Five of those files imported the proxy; the baseline is 1
  (`db/script.ts`, whose `runWithScriptDb` nobody calls).
- The last `getCurrentTenantDb()` callers moved to explicit scopes: the
  Admin page's reads use the guard's tenant, `requirePageRoles`
  (`loaders/page-access.ts`) the session's, and the tenant export
  (`actions/admin/export.ts`, which a superadmin who is no member may
  call) the request's Corps by id.
- The server components of /profile hand the page's session to
  `loadProfilePreferences` and `loadEloEnabled`, as they already did to
  `loadOpenBill` and `loadEloStats`; the personal calendar feed reads the
  hidden types through the preferences service with its own scope. The
  public website's pictures need no session and use the request host
  (`currentTenantScope`).
- `requireSelfOrRole` returns the caller's tenant too, like
  `requireCaller`.
- The reads keep their old answers: the public pictures log a failed
  read and answer no picture, the preference getters answer the default
  for anonymous callers, the own profile and the Admin page's lists
  throw their old messages. The profile page's query budget is
  unchanged.
- The actions name their id parameters (`kontoId`), so the isolation test
  passes a foreign Konto.
- Still in `src/server/actions`, already on explicit databases (the
  action's scope, `getTenantDb(id)` or the control DB) and therefore left
  for later: `admin/export.ts`, `newuser/`, `profile/{auth,avatar}.ts`,
  `superadmin/` and `transactions/`.

### The proxy is gone

- `src/server/db/index.ts` (the proxy `db` and `client`, `runWithDb`,
  `NoDbContextError`), `runWithScriptDb` in `db/script.ts` and
  `getCurrentTenantDb` in `db/tenants.ts` are deleted. `getTenantClient`
  stays for the connection tests.
- The import-count ratchet (`scripts/ci/proxy-db*`, `pnpm proxy-db:check`
  and `:baseline`, the CI step) is gone with it; the Biome rule above
  keeps the proxy and `getCurrentTenantDb` out instead, in `biome ci`.
- The tests no longer double the proxy (`test/setup.ts`). The real
  routing tests (`db/routing.test.ts`) and the harness test check the
  same things on `currentTenantScope()`: the request host's tenant, never
  a forged `x-tenant-id`, a loud failure for an unknown host; the script
  test checks that the request's scope has no fallback outside a request.
