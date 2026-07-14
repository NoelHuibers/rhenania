// tenant-default-config.ts — defaults for the per-tenant configurable enums.
//
// Used by:
//   - `tenant-provisioning.ts` to seed defaults when creating a new tenant.
//   - `scripts/backfill-tenant-config.ts` to seed/repair the existing
//     Rhenania tenant DB.
//
// `key` is the value stored in the referencing column (kontos.kasseType,
// events.type, etc.). `label` is the human-readable name shown in UI.
// New tenants get the German Corps defaults — operators can edit per-tenant
// after provisioning.

export type ConfigDefault = {
	key: string;
	label: string;
	displayOrder: number;
};

export const DEFAULT_KASSE_TYPES: ConfigDefault[] = [
	{ key: "Getränkekasse", label: "Getränkekasse", displayOrder: 0 },
	{ key: "Aktivenkasse", label: "Aktivenkasse", displayOrder: 1 },
	{ key: "CC-Kasse", label: "CC-Kasse", displayOrder: 2 },
	{ key: "Fuchsenkasse", label: "Fuchsenkasse", displayOrder: 3 },
	{ key: "AHV Kasse", label: "AHV Kasse", displayOrder: 4 },
	{ key: "Hausverein Kasse", label: "Hausverein Kasse", displayOrder: 5 },
];

export const DEFAULT_EVENT_TYPES: ConfigDefault[] = [
	{ key: "Intern", label: "Intern", displayOrder: 0 },
	{ key: "AHV", label: "AHV", displayOrder: 1 },
	{ key: "oCC", label: "oCC", displayOrder: 2 },
	{ key: "SC", label: "SC", displayOrder: 3 },
	{ key: "Jour Fix", label: "Jour Fix", displayOrder: 4 },
	{ key: "Stammtisch", label: "Stammtisch", displayOrder: 5 },
	{ key: "Sonstige", label: "Sonstige", displayOrder: 6 },
];

export const DEFAULT_HOMEPAGE_SECTIONS: ConfigDefault[] = [
	{ key: "header", label: "Header", displayOrder: 0 },
	{ key: "aktive", label: "Aktive", displayOrder: 1 },
	{ key: "haus", label: "Haus", displayOrder: 2 },
	{ key: "footer", label: "Footer", displayOrder: 3 },
];

export type MemberStatusDefault = ConfigDefault & {
	beitragspflichtig: boolean;
};

// Beitragspflichtig = active members (Fuchs/CB/IaCB), not Alte Herren.
// Free-text variants in members.status (IaCBoB, "AH idC", …) are matched by
// normalized longest-prefix against these keys.
export const DEFAULT_MEMBER_STATUSES: MemberStatusDefault[] = [
	{ key: "Fuchs", label: "Fuchs", beitragspflichtig: true, displayOrder: 0 },
	{
		key: "CB",
		label: "CB (Corpsbursche)",
		beitragspflichtig: true,
		displayOrder: 1,
	},
	{
		key: "IaCB",
		label: "IaCB (Inaktiver CB)",
		beitragspflichtig: true,
		displayOrder: 2,
	},
	{ key: "IaCBoB", label: "IaCBoB", beitragspflichtig: true, displayOrder: 3 },
	{
		key: "AH",
		label: "AH (Alter Herr)",
		beitragspflichtig: false,
		displayOrder: 4,
	},
	{ key: "AHEB", label: "AHEB", beitragspflichtig: false, displayOrder: 5 },
];
