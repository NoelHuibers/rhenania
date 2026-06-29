// Shared role-name constants (client- and edge-safe; no server imports).

// AHV (Altherrenverein) board — single-holder positions, assignable in Admin.
export const AHV_VORSTAND_ROLES = [
	"AHV 1. Vorstand",
	"AHV 2. Vorstand",
	"AHV 3. Vorstand",
] as const;

// Hausverein board — single-holder positions, assignable in Admin.
export const HAUSVEREIN_VORSTAND_ROLES = [
	"Hausverein 1. Vorstand",
	"Hausverein 2. Vorstand",
	"Hausverein 3. Vorstand",
] as const;

// Who may view + edit the Adressliste: Admins and the AHV board.
export const ADRESSLISTE_ROLES: string[] = ["Admin", ...AHV_VORSTAND_ROLES];
