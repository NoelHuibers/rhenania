---
name: verify
description: How to drive this app end-to-end locally for verification (login, tenant mapping, gotchas).
---

# Verifying changes in the running app

## Launch (local databases — the default)

- `pnpm db:local:reset` creates `.data/{control,rhenania,hassia}.db`, applies
  all migrations and seeds demo tenants, users and drinks
  (`scripts/dev/seed-data.ts`). Re-run it any time for a clean state.
- `pnpm dev:local` starts `next dev` against those files. Every key from
  `.env` is blanked (`scripts/dev/local-env.ts`), so production databases,
  Blob storage and mail credentials are unreachable.
- `http://localhost:3000` → Rhenania (lokal), `http://hassia.localhost:3000`
  → Hassia (lokal, markup + billing flags on). Page titles end in "(lokal)",
  which is a quick check that you are NOT on production data.
- Port 3000 only for sign-in: `BETTER_AUTH_URL` and the trusted origin of
  the `localhost` tenant domain are fixed to `http://localhost:3000`. On
  another port (`PORT=3458 pnpm dev:local`, e.g. next to an agent's server)
  the browser sign-in fails with "Invalid origin"; sign in via the API with
  `-H "Origin: http://localhost:3000"` and reuse the cookie instead.
- Outgoing mail is written to `.data/mail/*.json` instead of being sent
  (password resets, invites, bills).
- Blob uploads (avatars, drink pictures, bill PDFs) have no token locally and
  fail; don't treat that as a regression.

## Getting a session

- Every seeded user has the password `local-dev-password`:
  `admin@rhenania.test` (Admin, Getränkewart, CC-Kasse, superadmin),
  `wart@rhenania.test` (Getränkewart), `member@rhenania.test`,
  `admin@hassia.test`, `member@hassia.test`, `both@example.test` (both Corps).
- Browser: sign in at `/auth/signin` — inputs `#email` / `#password`, submit
  button is disabled until both fields have React state.
- Without a browser: `curl -c jar -X POST http://localhost:3000/api/auth/sign-in/email -H "Content-Type: application/json" -H "Origin: http://localhost:3000" -d '{"email":"member@rhenania.test","password":"local-dev-password"}'`,
  then `curl -b jar http://localhost:3000/trinken`.

## Production data (only when the owner explicitly asks)

`pnpm dev` (without `:local`) runs against the REAL Turso control + tenant
DBs from `.env`. Only use it when the owner asks for it; anything you create
is production data — label it clearly and delete it afterwards.

## Driving the UI

- The t3-code preview tabs may accept `navigate` but time out on
  `snapshot`/`evaluate`. Fallback that works: `playwright-core` in a temp
  dir (`pnpm add playwright-core`) launched with `channel: "msedge"`.
- **Hydration races**: `page.fill()` before hydration is lost (React state
  stays empty) and early clicks are swallowed. Use
  `waitUntil: "networkidle"`, `pressSequentially()` for inputs, and
  retry-click loops for buttons that open dialogs.
- Tables/cards render twice (mobile `sm:hidden` + desktop `hidden sm:block`)
  — text locators match the hidden mobile copy first; scope to
  `getByRole("row")` or wait with `state: "attached"`.
- Radix Selects: click the trigger, then `getByRole("option")`.
- Toasts (sonner) are reliable wait targets for action success/failure.

## Known noise

- Next dev overlay shows a pre-existing hydration mismatch on `<html>`
  (`color-scheme` style from next-themes) — not a regression signal.
- `GET /placeholder.svg 404` in dev logs is pre-existing.
