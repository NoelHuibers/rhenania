# Rhenania WebApp

Dies ist die rhenania-stuttgart.de Seite.

## Features

- Website
- Benutzerverwaltung
- Getränkemanagement
- Rechnungsverwaltung
- Gameification mit Leaderboard und Elo System

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
