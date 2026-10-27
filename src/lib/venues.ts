// The default "Ort" for new events: the tenant's first venue (the one created
// earliest), or nothing. Never a hard-coded house name (#36).

type VenueLike = { shortName: string; createdAt: Date };

export function defaultVenueName(venues: readonly VenueLike[]): string {
	let first: VenueLike | undefined;
	for (const venue of venues) {
		if (!first || venue.createdAt.getTime() < first.createdAt.getTime()) {
			first = venue;
		}
	}
	return first?.shortName ?? "";
}
