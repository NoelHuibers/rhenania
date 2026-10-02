// features.ts — server-side feature flag checks for the current tenant.
//
// These are the authoritative checks: gate server actions with them, never
// rely on a hidden button alone. Flags come from the cached tenant context,
// so a check costs no extra query.

import {
	defaultFeatureFlags,
	FEATURES,
	type FeatureFlags,
	type FeatureKey,
} from "~/lib/features";
import { getCurrentTenant } from "~/server/lib/tenant-context";

export async function getFeatureFlags(): Promise<FeatureFlags> {
	const tenant = await getCurrentTenant();
	return tenant?.features ?? defaultFeatureFlags();
}

export async function hasFeature(key: FeatureKey): Promise<boolean> {
	return (await getFeatureFlags())[key];
}

export class FeatureDisabledError extends Error {
	constructor(key: FeatureKey) {
		super(`Die Funktion „${FEATURES[key].label}" ist nicht freigeschaltet.`);
		this.name = "FeatureDisabledError";
	}
}

export async function requireFeature(key: FeatureKey): Promise<void> {
	if (!(await hasFeature(key))) throw new FeatureDisabledError(key);
}
