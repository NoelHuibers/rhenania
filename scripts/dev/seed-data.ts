// scripts/dev/seed-data.ts — the fixed demo dataset for local dev and E2E.
// IDs are stable so E2E tests can reference them.

import type { FeatureKey } from "~/lib/features";

export const DEV_PASSWORD = "local-dev-password";

export type SeedTenant = {
	id: string;
	slug: "rhenania" | "hassia";
	displayName: string;
	hostnames: string[];
	features: FeatureKey[];
	markupPercent: number;
	drinks: Array<{
		id: string;
		name: string;
		price: number;
		available?: boolean;
	}>;
};

export const SEED_TENANTS: SeedTenant[] = [
	{
		id: "tenant-rhenania",
		slug: "rhenania",
		displayName: "Corps Rhenania Stuttgart (lokal)",
		hostnames: ["localhost", "rhenania.localhost"],
		features: [],
		markupPercent: 0,
		drinks: [
			{ id: "drink-rh-pils", name: "Pils", price: 1.2 },
			{ id: "drink-rh-weizen", name: "Weizen", price: 1.5 },
			{ id: "drink-rh-spezi", name: "Spezi", price: 1 },
			{ id: "drink-rh-wasser", name: "Wasser", price: 0.6 },
			{ id: "drink-rh-radler", name: "Radler", price: 1.2, available: false },
		],
	},
	{
		id: "tenant-hassia",
		slug: "hassia",
		displayName: "Corps Hassia (lokal)",
		hostnames: ["hassia.localhost"],
		features: [
			"drinks.markup",
			"billing.markAllPaid",
			"billing.treasurerRecipient",
		],
		markupPercent: 10,
		drinks: [
			{ id: "drink-ha-pils", name: "Pils", price: 1.3 },
			{ id: "drink-ha-cola", name: "Cola", price: 1.1 },
		],
	},
];

export type SeedUser = {
	id: string;
	name: string;
	email: string;
	superAdmin?: boolean;
	memberships: Array<{ tenantId: string; roles: string[] }>;
};

export const SEED_USERS: SeedUser[] = [
	{
		id: "user-rh-admin",
		name: "Anton Admin",
		email: "admin@rhenania.test",
		superAdmin: true,
		memberships: [
			{
				tenantId: "tenant-rhenania",
				roles: ["Admin", "Getränkewart", "CC-Kasse"],
			},
		],
	},
	{
		id: "user-rh-wart",
		name: "Gustav Getränkewart",
		email: "wart@rhenania.test",
		memberships: [
			{ tenantId: "tenant-rhenania", roles: ["Getränkewart", "Hausbewohner"] },
		],
	},
	{
		id: "user-rh-member",
		name: "Max Mitglied",
		email: "member@rhenania.test",
		memberships: [{ tenantId: "tenant-rhenania", roles: ["Hausbewohner"] }],
	},
	{
		id: "user-ha-admin",
		name: "Hanna Hassia",
		email: "admin@hassia.test",
		memberships: [
			{ tenantId: "tenant-hassia", roles: ["Admin", "Getränkewart"] },
		],
	},
	{
		id: "user-ha-member",
		name: "Hugo Hassia",
		email: "member@hassia.test",
		memberships: [{ tenantId: "tenant-hassia", roles: [] }],
	},
	{
		id: "user-both",
		name: "Doppel Mitglied",
		email: "both@example.test",
		memberships: [
			{ tenantId: "tenant-rhenania", roles: [] },
			{ tenantId: "tenant-hassia", roles: [] },
		],
	},
];
