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

Produktion wird beim Deploy automatisch migriert. Der Vercel-Build-Befehl
(`vercel.json`) ist `pnpm build && pnpm db:migrate:deploy`. Ein
Production-Deploy läuft daher so ab:

1. Code bauen (`next build`); schlägt das fehl, wird nichts migriert.
2. Control-DB migrieren, dann alle Tenant-DBs, Rhenania zuerst als Canary
   (`MIGRATION_CANARY`). Scheitert der Canary, bleiben die übrigen Tenants
   unberührt.
3. Erst danach schaltet Vercel die neue Version live. Scheitert eine
   Migration, schlägt der Build fehl und die laufende Version bleibt online.

Preview- und lokale Builds migrieren nie. Überlappende Production-Builds
warten aufeinander (Lease in der Control-DB, Tabelle `__deploy_lock`). Vor
jeder DB steht ein PITR-Zeitpunkt im Build-Log (Wiederherstellung über Turso
Point-in-Time-Recovery), am Ende eine Tabelle und eine JSON-Zeile
`deploy-migrations` pro Deploy.

Weil die alte Version während des Builds schon auf dem neuen Schema läuft,
müssen Migrationen additiv sein; CI erzwingt das (siehe oben,
`migration:contract`). Rollbacks gehen nur vorwärts: eine neue Migration statt
eines Reverts. Ein Instant Rollback in Vercel ist sicher, solange die
Migrationen additiv waren.

Voraussetzung in Vercel (nur Environment *Production*):
`CONFIRM_PROD=<control-db-host>`. Ohne diese Variable bricht der
Production-Build ab, statt Code vor seinem Schema auszuliefern.

Von Hand, etwa zum Prüfen oder für eine Reparatur: Schreibende Skripte und
`drizzle-kit migrate` verweigern Remote-Datenbanken, solange `CONFIRM_PROD`
nicht genau den DB-Host nennt. Die Fehlermeldung zeigt den Wert an.

```bash
pnpm db:migrate:deploy --dry-run                       # was würde ein Deploy anwenden?
CONFIRM_PROD=<control-db-host> pnpm db:migrate-tenants # alle Tenant-DBs von Hand
```

`drizzle-kit push` gibt es bewusst nicht mehr als Skript: Es umgeht das
Migrations-Journal und hat früher zu Drift geführt.
