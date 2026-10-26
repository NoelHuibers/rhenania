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

Vor einem Deploy mit Schemaänderungen zuerst migrieren:

```bash
pnpm db:control:migrate   # Control-DB
pnpm db:migrate-tenants   # alle Tenant-DBs
```
