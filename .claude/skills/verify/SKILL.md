---
name: verify
description: How to drive this app end-to-end locally for verification (login, tenant mapping, gotchas).
---

# Verifying changes in the running app

## Launch

- `pnpm dev` (Turbopack, ready in ~3s on http://localhost:3000).
- `localhost` resolves to the **rhenania** tenant via the control DB's
  `tenant_domains` table — the dev server runs against the REAL Turso
  control + tenant DBs from `.env`. Anything you create is production
  data: label it clearly and delete it afterwards.

## Getting a session

- Email+password auth is enabled (better-auth, `requireEmailVerification`).
  No test account exists; create a throwaway one directly in the DBs:
  control `user` (emailVerified=true) + `account` (providerId
  `"credential"`, bcryptjs hash, cost 12) + `tenant_membership`, then
  mirror into the tenant DB (`mirrorUserToTenant`) and assign a role via
  `user_role` (see `scripts/grant-tenant-admin.ts` for the pattern).
  Delete all rows (incl. `session`) when done.
- Sign in at `/auth/signin` — inputs `#email` / `#password`, submit button
  is disabled until both fields have React state.

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
