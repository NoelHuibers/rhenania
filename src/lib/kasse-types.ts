// Hard-coded fallback list of Rhenania's default kasse types. Real list
// lives per-tenant in the `kasse_type` table; UI components should query
// it for the source of truth. This is kept only for components that haven't
// been migrated to the dynamic source yet.
export const KASSE_TYPES = [
	"Getränkekasse",
	"Aktivenkasse",
	"CC-Kasse",
	"Fuchsenkasse",
	"AHV Kasse",
	"Hausverein Kasse",
] as const;

// Per-tenant configurable; widened to `string` so values from non-Rhenania
// tenants type-check.
export type KasseType = string;
