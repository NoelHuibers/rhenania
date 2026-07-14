// member-statuses.ts — per-tenant member status taxonomy.
//
// The Adressliste `members.status` column is free text (spreadsheet imports
// contain variants like "AH idC", IaCBoB, FCK). The tenant's `member_status`
// config table defines the canonical statuses and which of them are
// beitragspflichtig; free-text values are classified by matching the
// normalized status against the normalized keys, longest key first, so
// "iacbob" hits IaCBoB/IaCB before CB, and "ah idc" hits AH. No match →
// nicht beitragspflichtig.
//
// Tenants whose config table is empty (not yet backfilled) fall back to the
// German Corps defaults, which reproduce the previously hardcoded behavior.

import { asc } from "drizzle-orm";

import { db } from "~/server/db";
import { memberStatuses } from "~/server/db/schema";
import { DEFAULT_MEMBER_STATUSES } from "~/server/lib/tenant-default-config";

export type TenantMemberStatus = {
	key: string;
	label: string;
	beitragspflichtig: boolean;
};

export async function getTenantMemberStatuses(): Promise<TenantMemberStatus[]> {
	const rows = await db
		.select({
			key: memberStatuses.key,
			label: memberStatuses.label,
			beitragspflichtig: memberStatuses.beitragspflichtig,
			isActive: memberStatuses.isActive,
		})
		.from(memberStatuses)
		.orderBy(asc(memberStatuses.displayOrder));

	const active = rows.filter((r) => r.isActive);
	if (active.length > 0) return active;
	return DEFAULT_MEMBER_STATUSES.map((d) => ({
		key: d.key,
		label: d.label,
		beitragspflichtig: d.beitragspflichtig,
	}));
}

const normalize = (s: string | null | undefined): string =>
	(s ?? "").toLowerCase().replace(/[^a-z]/g, "");

/**
 * Build a classifier over the tenant's statuses. Load the statuses once per
 * operation and reuse the matcher for every member row.
 */
export function makeBeitragspflichtigMatcher(
	statuses: TenantMemberStatus[],
): (status: string | null | undefined) => boolean {
	const byLongestKey = statuses
		.map((s) => ({ norm: normalize(s.key), flag: s.beitragspflichtig }))
		.filter((s) => s.norm.length > 0)
		.sort((a, b) => b.norm.length - a.norm.length);

	return (status) => {
		const s = normalize(status);
		if (!s) return false;
		for (const { norm, flag } of byLongestKey) {
			if (s.startsWith(norm)) return flag;
		}
		return false;
	};
}
