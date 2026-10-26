// Delay between two polls of the challenge badge. Every open page polls, so a
// tab whose feed does not change backs off; anything new snaps it back.

export const POLL_BASE_MS = 20_000;
export const POLL_MAX_MS = 120_000;

/**
 * @param previous delay used for the poll that just finished
 * @param changed  the poll returned something different from the last one
 * @param busy     the user has a challenge in flight (deadlines of minutes),
 *                 so the badge keeps the base rate
 */
export function nextPollDelay(
	previous: number,
	{ changed, busy }: { changed: boolean; busy: boolean },
): number {
	if (changed || busy) {
		return POLL_BASE_MS;
	}
	return Math.min(Math.max(previous, POLL_BASE_MS) * 2, POLL_MAX_MS);
}
