# Tests

```bash
pnpm test            # all unit + integration tests (Vitest)
pnpm test:watch      # watch mode
pnpm test:coverage   # with v8 coverage (report in ./coverage)
```

Tests never touch a remote database. `vitest.config.ts` replaces every DB URL
with a local `file:` path and does not load `.env`. `test/setup.ts` aborts the
run if a non-`file:` URL or any production token leaks in.

## How it works

- `test/global-setup.ts` applies `drizzle/` (tenant) and `drizzle/control`
  migrations once to template DB files.
- `setupTestDatabases()` gives each test a fresh control DB. `createTenant()`
  adds a tenant: a control row, a `<slug>.test.localhost` domain and its own
  copy of the tenant template DB.
- `test/setup.ts` replaces `next/headers`, `next/cache`, `~/server/db`,
  `~/server/db/control`, `~/server/db/tenants` and `~/server/auth` with doubles
  that read `test/state.ts`. Everything else is real: server actions, tenant
  context, feature flags and Drizzle queries run unchanged.
- The first tenant created becomes the tenant of the simulated request.
  Switch with `switchTenant()`, sign in with `signInAs(user)`.

## Writing an integration test

```ts
import { createDrink, createTenant, createUser, signInAs, tenantDb,
  setupTestDatabases } from "../../../test/harness";

setupTestDatabases();

test("member orders a drink", async () => {
  await createTenant({ features: ["drinks.markup"] });
  signInAs(await createUser({ roles: ["Getränkewart"] }));
  const drink = await createDrink({ price: 1.5 });
  // call the server action, then assert on tenantDb()
});
```

Fire-and-forget side effects (achievements, mails) should be mocked in the
test file with `vi.mock(...)` and tested separately.

## End-to-end tests (Playwright)

```bash
pnpm test:e2e       # next build + next start against freshly seeded .data/e2e
pnpm test:e2e:dev   # same specs against next dev (faster while iterating)
```

- Port 3000 must be free. The run refuses to reuse a running server, because
  that one might be pointed at production.
- The web server is started through `scripts/dev/run.ts`, so every `.env`
  credential is blanked and the app only sees `.data/e2e/*.db`. The data is
  reseeded on every run (`scripts/dev/seed-data.ts`).
- `e2e/auth.setup.ts` signs every user in once and stores the cookies, because
  production builds rate-limit sign-in. In specs, `signIn(page, email, origin)`
  loads those cookies. Add new user/host pairs to `SESSIONS` in
  `e2e/support.ts`.
- Mails are read from the outbox (`latestMailTo(email)`).
- Tests tagged `@mobile` also run on a Pixel 7 viewport.
- On failure, traces and screenshots are in `test-results/`. Open them with
  `pnpm exec playwright show-trace <trace.zip>`.

## Accessibility (axe)

`e2e/a11y.spec.ts` scans the main screens per role with axe-core (WCAG 2.2 AA
tags, serious and critical only) as part of `pnpm test:e2e`. Today's known
violations are recorded per screen in `e2e/a11y-baseline.json`. A new rule or
more failing elements than recorded fails the run. After fixing issues, shrink
the baseline:

```bash
A11Y_UPDATE=1 pnpm exec playwright test e2e/a11y.spec.ts --project=desktop
```

## Visual regression

`e2e/visual.spec.ts` screenshots key screens on phone (390), tablet (820) and
desktop (1440) in light and dark mode: 48 baselines in `e2e/__screenshots__`.
Fonts differ between operating systems, so baselines are only rendered and
compared inside the official Playwright Linux image, locally via podman or
docker:

```bash
pnpm test:visual          # compare
pnpm test:visual:update   # accept intended UI changes (review the PNG diff!)
```

CI runs the same image (`visual` job). When bumping `@playwright/test`, update
the image tag in `.github/workflows/ci.yml` too; `test/ci-config.test.ts`
fails if they drift apart.
