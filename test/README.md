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
