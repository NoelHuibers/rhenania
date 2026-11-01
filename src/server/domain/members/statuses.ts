// statuses.ts — which Adressliste statuses owe the Semesterbeitrag.
//
// Pure. The Adressliste `members.status` column is free text (spreadsheet
// imports contain variants like "AH idC", IaCBoB, FCK). The tenant's
// `member_status` config table defines the canonical statuses and which of
// them are beitragspflichtig; free-text values are classified by matching
// the normalized status against the normalized keys, longest key first, so
// "iacbob" hits IaCBoB/IaCB before CB, and "ah idc" hits AH. No match →
// nicht beitragspflichtig.

export type TenantMemberStatus = {
	key: string;
	label: string;
	beitragspflichtig: boolean;
};

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
		if (!s) {
			return false;
		}
		for (const { norm, flag } of byLongestKey) {
			if (s.startsWith(norm)) {
				return flag;
			}
		}
		return false;
	};
}
