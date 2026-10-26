import { describe, expect, test } from "vitest";

import { nextPollDelay, POLL_BASE_MS, POLL_MAX_MS } from "./poll-backoff";

describe("nextPollDelay", () => {
	test("doubles while nothing changes, up to the cap", () => {
		const idle = { changed: false, busy: false };
		const delays = [POLL_BASE_MS];
		for (let i = 0; i < 4; i++) {
			delays.push(nextPollDelay(delays.at(-1) ?? 0, idle));
		}
		expect(delays).toEqual([20_000, 40_000, 80_000, 120_000, POLL_MAX_MS]);
	});

	test("snaps back to the base rate when the feed changes", () => {
		expect(nextPollDelay(POLL_MAX_MS, { changed: true, busy: false })).toBe(
			POLL_BASE_MS,
		);
	});

	test("keeps the base rate while a challenge is in flight", () => {
		expect(nextPollDelay(POLL_BASE_MS, { changed: false, busy: true })).toBe(
			POLL_BASE_MS,
		);
		expect(nextPollDelay(80_000, { changed: false, busy: true })).toBe(
			POLL_BASE_MS,
		);
	});
});
