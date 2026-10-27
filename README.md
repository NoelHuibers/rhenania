# Rhenania WebApp

Dies ist die rhenania-stuttgart.de Seite.

## Features

- Website
- Benutzerverwaltung
- Getränkemanagement
- Rechnungsverwaltung
- Gameification mit Leaderboard und Elo System

## Entwicklung & Qualität

Lokal entwickeln, ohne die Produktionsdatenbanken anzufassen:

```bash
pnpm db:local:reset   # .data/*.db anlegen, migrieren, Demo-Daten (2 Corps)
pnpm dev:local        # next dev gegen .data/, alle .env-Zugangsdaten ausgeblendet
```

`http://localhost:3000` ist Rhenania, `http://hassia.localhost:3000` ist Hassia.
Alle Demo-Nutzer haben das Passwort `local-dev-password`, z. B.
`admin@rhenania.test`, `member@rhenania.test`, `admin@hassia.test`. Mails landen
als JSON in `.data/mail/`. `pnpm dev` ohne `:local` arbeitet weiterhin gegen die
echten Datenbanken aus `.env`.

```bash
pnpm check        # Biome (Lint + Format)
pnpm typecheck    # TypeScript
pnpm test         # Vitest, nur gegen lokale Test-DBs (siehe test/README.md)
pnpm test:coverage
```

Biome ist streng konfiguriert (`biome.jsonc`): u. a. keine `any`, keine
Non-null-Assertions, Block-Statements, keine Default-Exports außerhalb von
`src/app`, kein `console.log` (Server-Logging über `~/server/lib/log`), keine
DB-Zugriffe aus Komponenten. Ein Pre-Commit-Hook (lefthook, wird mit
`pnpm install` eingerichtet) formatiert und prüft die gestagten Dateien.

Abhängigkeiten: Dependabot öffnet montags gruppierte Update-PRs
(`.github/dependabot.yml`), `audit.yml` prüft wöchentlich die Produktions-
abhängigkeiten auf bekannte Sicherheitslücken. Overrides in `package.json`
(`pnpm.overrides`) quartalsweise mit `pnpm why <paket>` überprüfen und
entfernen, sobald upstream gepatcht ist.

PR-Titel folgen Conventional Commits (`feat(getraenke): …`, `fix(billing): …`),
weil Squash-Merges den Titel als Commit-Nachricht nehmen. release-please hält
daraus einen Release-PR mit Changelog und Versionsnummer offen; sein Merge
setzt den Tag `vX.Y.Z`.

CI (`.github/workflows/ci.yml`) führt Lint, Typecheck, Tests (TZ=Europe/Berlin
und UTC, mit Coverage) und einen Build gegen lokal migrierte `file:`-DBs aus.
CI bekommt keine Produktions-Zugangsdaten.

## Feature-Flags pro Corps

Einzelne Funktionen lassen sich pro Tenant an- und ausschalten. Alle Flags
sind standardmäßig aus, ein Corps ohne Einträge verhält sich wie bisher.

- Registry: `src/lib/features.ts` (Schlüssel, Name, Beschreibung).
- Schalten: Superadmin, Tenant-Detailseite, Abschnitt "Features". Gespeichert
  in der Control-DB (`control_tenant_feature`).
- Prüfen: auf dem Server mit `hasFeature()` aus `~/server/lib/features`
  (maßgeblich), im Client mit `useFeature()` aus `~/components/TenantProvider`
  (nur Darstellung).
- Werte zu einem Feature (z. B. Aufschlag in Prozent, Kassenwart-Mail) stehen
  in der Tenant-DB (`kasse_config`) und werden vom Getränkewart in der Kasse
  gepflegt.

Migrationen werden in CI geprüft (`pnpm db:check`, Job „Migrations“):

- Journal-Einträge brauchen streng steigende `when`-Werte, sonst überspringt
  der Drizzle-Migrator sie still.
- Bereits angewendete Migrationen werden nie geändert, neue nur angehängt.
  Nach einem Rebase daher neu generieren.
- Das Schema muss zu den committeten Migrationen passen (`pnpm db:generate`
  bzw. `pnpm db:control:generate` erzeugt keine neuen Dateien).
- Destruktive Statements (`DROP`/`RENAME`) nur nach dem Expand/Contract-Prinzip:
  erst wenn kein laufender Code die alte Struktur mehr braucht. Der PR bekommt
  dann das Label `migration:contract`.

Vor einem Deploy mit Schemaänderungen zuerst migrieren. Schreibende Skripte
und `drizzle-kit migrate` verweigern Remote-Datenbanken, solange `CONFIRM_PROD`
nicht genau den DB-Host nennt. Die Fehlermeldung zeigt den Wert an:

```bash
pnpm db:migrate-tenants --dry-run                     # was steht an? (ohne Bestätigung)
CONFIRM_PROD=<control-db-host> pnpm db:control:migrate # Control-DB
CONFIRM_PROD=<control-db-host> pnpm db:migrate-tenants # alle Tenant-DBs
```

`drizzle-kit push` gibt es bewusst nicht mehr als Skript: Es umgeht das
Migrations-Journal und hat früher zu Drift geführt.

## Geplante Jobs (Vercel Cron)

`vercel.json` ruft alle 5 Minuten `/api/cron/challenges` auf: Herausforderungen
nach Ablauf der Antwort- oder Spielfrist verfallen, unbestätigte Ergebnisse
werden nach 10 Minuten wie gemeldet verbucht, in allen aktiven Corps und für
Cross-Corps-Herausforderungen. Seitenaufrufe und der Badge-Poll schreiben
nichts; bis der Job gelaufen ist, zeigen sie Überfälliges als abgelaufen an.

- `CRON_SECRET` (mind. 16 Zeichen, `openssl rand -base64 32`) muss in Vercel
  (Production) gesetzt sein. Vercel schickt ihn als `Authorization: Bearer …`;
  ohne die Variable lehnt die Route jeden Aufruf ab.
- Hobby-Plan: nur ein Lauf pro Tag, ein `*/5`-Zeitplan lässt den Deploy
  scheitern („Hobby accounts are limited to daily cron jobs“). Dann den
  Zeitplan auf täglich stellen (z. B. `0 4 * * *`); unbestätigte Ergebnisse
  werden dann erst bis zu einen Tag später verbucht (Bestätigen geht weiter
  sofort). Pro: minutengenau.
- Manuell auslösen:
  `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/challenges`
