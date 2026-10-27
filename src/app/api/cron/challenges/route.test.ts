import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { challenges } from "~/server/db/schema";
import {
	advanceClock,
	createPlayers,
	freezeClock,
	MINUTE,
	playChallenge,
} from "../../../../../test/factories/game";
import {
	createDrink,
	createTenant,
	setupTestDatabases,
	tenantDb,
} from "../../../../../test/harness";

vi.mock("~/server/actions/achievements/tracking", () => ({
	checkAndUnlockAchievements: vi.fn(),
}));

setupTestDatabases();

const SECRET = "a-cron-secret-of-sufficient-length";

beforeEach(() => freezeClock("2026-10-26T20:00:00Z"));
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllEnvs();
	vi.resetModules();
	vi.restoreAllMocks();
});

/** The route as built with the given CRON_SECRET (`env` is read on import). */
async function cronRoute(secret: string) {
	vi.stubEnv("CRON_SECRET", secret);
	vi.resetModules();
	return (await import("./route")).GET;
}

const call = (authorization?: string) =>
	new Request("http://x/api/cron/challenges", {
		headers: authorization ? { authorization } : {},
	});

/** One result proposed 11 minutes ago, i.e. due for auto-settle. */
async function overdueResult() {
	await createTenant();
	const [anna, bert] = await createPlayers(2);
	const drink = await createDrink();
	const { challengeId } = await playChallenge({
		challenger: anna,
		opponent: bert,
		drink,
		winner: anna,
	});
	advanceClock(11 * MINUTE);
	return async () => {
		const [row] = await tenantDb()
			.select({ status: challenges.status })
			.from(challenges)
			.where(eq(challenges.id, challengeId));
		return row?.status;
	};
}

describe("GET /api/cron/challenges", () => {
	test("refuses everything while CRON_SECRET is not set", async () => {
		const status = await overdueResult();
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		const GET = await cronRoute("");

		for (const header of [undefined, "Bearer ", "Bearer undefined"]) {
			expect((await GET(call(header))).status).toBe(401);
		}
		expect(logged).toHaveBeenCalledWith(
			expect.stringContaining("CRON_SECRET is not set"),
		);
		expect(await status()).toBe("result_proposed");
	});

	test("refuses a missing or wrong bearer token", async () => {
		const status = await overdueResult();
		const GET = await cronRoute(SECRET);

		for (const header of [
			undefined,
			SECRET,
			`Bearer ${SECRET.slice(0, -1)}`,
			`Bearer ${SECRET}x`,
			`Basic ${SECRET}`,
		]) {
			const res = await GET(call(header));
			expect(res.status).toBe(401);
			expect(await res.json()).toEqual({ error: "Unauthorized" });
		}
		expect(await status()).toBe("result_proposed");
	});

	test("sweeps with Vercel's bearer token", async () => {
		const status = await overdueResult();
		const GET = await cronRoute(SECRET);

		const res = await GET(call(`Bearer ${SECRET}`));

		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("no-store");
		expect(await res.json()).toEqual({
			ok: true,
			corps: [expect.objectContaining({ settled: 1, failed: 0 })],
			crossExpired: 0,
		});
		expect(await status()).toBe("settled");
	});

	test("answers 500 when a Corps could not be swept", async () => {
		await overdueResult();
		const GET = await cronRoute(SECRET);
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(tenantDb(), "batch").mockRejectedValueOnce(new Error("timeout"));

		const res = await GET(call(`Bearer ${SECRET}`));

		expect(res.status).toBe(500);
		expect(await res.json()).toMatchObject({
			ok: false,
			corps: [expect.objectContaining({ failed: 1 })],
		});
		expect(logged).toHaveBeenCalledWith(
			expect.stringContaining("challenge sweep incomplete"),
		);
	});
});
