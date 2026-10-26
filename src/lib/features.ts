// features.ts — registry of per-tenant feature flags.
//
// Every flag is OFF unless a superadmin switches it on for a tenant
// (control DB table `control_tenant_feature`). A tenant without rows behaves
// exactly like the app did before flags existed.
//
// Adding a flag: add an entry here, then gate the behaviour with
// `hasFeature()` on the server (authoritative) and `useFeature()` in client
// components (presentation only). Tenant-chosen values that belong to a
// feature (a percentage, an email address) live in the tenant DB, not here.

export const FEATURES = {
	"drinks.markup": {
		label: "Preisaufschlag",
		description:
			"Prozentualer Aufschlag auf persönliche Bestellungen. Der Aufschlag wird als Gewinn ausgewiesen, auch in der Inventur.",
	},
	"billing.markAllPaid": {
		label: "Alle haben gezahlt",
		description:
			"Knopf in der Kasse, der alle offenen Mitgliederrechnungen auf einmal als bezahlt markiert.",
	},
	"billing.treasurerRecipient": {
		label: "Rechnungen an den Kassenwart",
		description:
			"Rechnungen können statt an die Mitglieder einzeln an eine feste Kassenwart-Adresse gehen.",
	},
} as const;

export type FeatureKey = keyof typeof FEATURES;
export type FeatureFlags = Record<FeatureKey, boolean>;

export const FEATURE_KEYS = Object.keys(FEATURES) as FeatureKey[];

export function isFeatureKey(value: string): value is FeatureKey {
	return Object.hasOwn(FEATURES, value);
}

/** All flags off — the baseline every tenant starts from. */
export function defaultFeatureFlags(): FeatureFlags {
	return Object.fromEntries(
		FEATURE_KEYS.map((key) => [key, false]),
	) as FeatureFlags;
}

/**
 * Builds the full flag map from stored rows. Unknown keys (a flag that was
 * removed from the registry) are ignored; missing keys stay off.
 */
export function resolveFeatureFlags(
	rows: ReadonlyArray<{ key: string; enabled: boolean }>,
): FeatureFlags {
	const flags = defaultFeatureFlags();
	for (const row of rows) {
		if (isFeatureKey(row.key)) {
			flags[row.key] = row.enabled;
		}
	}
	return flags;
}
