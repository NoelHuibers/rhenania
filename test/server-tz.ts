// Production servers run in UTC, dev machines in Europe/Berlin. CI runs the
// whole suite under both, but a test that proves Berlin wall-clock output on
// a UTC server should not depend on which run it is in.

import { onTestFinished } from "vitest";

/**
 * Switches the process time zone for the rest of the current test (Node
 * picks up a changed `process.env.TZ` immediately) and restores it after.
 */
export function useServerTimeZone(tz: string) {
	const before = process.env.TZ;
	process.env.TZ = tz;
	onTestFinished(() => {
		if (before === undefined) {
			delete process.env.TZ;
		} else {
			process.env.TZ = before;
		}
	});
}
