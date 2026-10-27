import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { checkAndUnlockAchievements } from "~/server/actions/achievements/tracking";
import {
	createChallenge,
	respondToChallenge,
} from "~/server/actions/game/challenge";
import { crossTenantChallenges, tenants } from "~/server/db/control-schema";
import { challenges, games, orders } from "~/server/db/schema";
import {
	advanceClock,
	createPlayers,
	freezeClock,
	getUserStatsRow,
	HOUR,
	MINUTE,
	playChallenge,
} from "../../../test/factories/game";
import {
	controlDb,
	countQueries,
	createDrink,
	createTenant,
	flushAfter,
	setKasseConfig,
	setupTestDatabases,
	signInAs,
	switchTenant,
	type TestTenant,
	tenantDb,
} from "../../../test/harness";
import { testState } from "../../../test/state";
import {
	type CorpsSweep,
	shownChallengeStatus,
	shownCrossChallengeStatus,
	sweepAllChallenges,
	sweepCorpsChallenges,
} from "./challenge-sweep";

// Achievements run after the response; they have their own tests.
vi.mock("~/server/actions/achievements/tracking", () => ({
	checkAndUnlockAchievements: vi.fn(),
}));

setupTestDatabases();

const START = "2026-10-26T20:00:00Z";

beforeEach(() => freezeClock(START));
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function statusOf(id: string, tenantId?: string) {
	const [row] = await tenantDb(tenantId)
		.select({ status: challenges.status })
		.from(challenges)
		.where(eq(challenges.id, id));
	return row?.status;
}

/**
 * A Corps with one unanswered challenge and one proposed, unconfirmed
 * result (anna beat bert, loser pays). The request moves to this Corps.
 */
async function corpsWithOpenChallenges(slug: string) {
	const tenant = await createTenant({ slug });
	switchTenant(tenant);
	const [anna, bert, carl] = await createPlayers(3);
	const drink = await createDrink({ name: "Pils", price: 1.5 });
	signInAs(anna);
	const unanswered = await createChallenge({
		opponentId: carl.id,
		drinkId: drink.id,
		payment: "loser",
	});
	const proposed = await playChallenge({
		challenger: anna,
		opponent: bert,
		drink,
		winner: anna,
		payment: "loser",
	});
	return {
		tenant,
		anna,
		bert,
		unanswered: unanswered.challengeId as string,
		proposed: proposed.challengeId,
	};
}

async function pendingCrossChallenge(from: TestTenant, to: TestTenant) {
	const [row] = await controlDb()
		.insert(crossTenantChallenges)
		.values({
			challengerId: "x-challenger",
			challengerTenantId: from.id,
			opponentId: "x-opponent",
			opponentTenantId: to.id,
			respondDeadline: new Date(Date.now() + 30 * MINUTE),
		})
		.returning({ id: crossTenantChallenges.id });
	return row?.id as string;
}

describe("sweepAllChallenges", () => {
	test("one run expires and settles in every active Corps and across Corps", async () => {
		const a = await corpsWithOpenChallenges("rhenania");
		const b = await corpsWithOpenChallenges("hassia");
		const cross = await pendingCrossChallenge(a.tenant, b.tenant);
		await createTenant({ slug: "ruhend", status: "suspended" });
		advanceClock(HOUR);

		const report = await sweepAllChallenges();

		expect(report).toEqual({
			ok: true,
			corps: expect.arrayContaining([
				{ slug: "rhenania", expired: 1, settled: 1, failed: 0 },
				{ slug: "hassia", expired: 1, settled: 1, failed: 0 },
			]),
			crossExpired: 1,
		});
		expect(report.corps).toHaveLength(2);
		for (const corps of [a, b]) {
			const id = corps.tenant.id;
			expect(await statusOf(corps.unanswered, id)).toBe("expired");
			expect(await statusOf(corps.proposed, id)).toBe("settled");
			expect(await tenantDb(id).select().from(games)).toEqual([
				expect.objectContaining({ winnerId: corps.anna.id }),
			]);
			expect(await tenantDb(id).select().from(orders)).toEqual([
				expect.objectContaining({ userId: corps.bert.id, amount: 2 }),
			]);
			expect((await getUserStatsRow(corps.anna.id))?.wins).toBe(1);
		}
		const [crossRow] = await controlDb()
			.select({ status: crossTenantChallenges.status })
			.from(crossTenantChallenges)
			.where(eq(crossTenantChallenges.id, cross));
		expect(crossRow?.status).toBe("expired");

		// Achievements are evaluated in each player's own Corps.
		await flushAfter();
		expect(checkAndUnlockAchievements).toHaveBeenCalledWith(
			a.anna.id,
			"game_won",
			undefined,
			{ tenantId: a.tenant.id },
		);
		expect(checkAndUnlockAchievements).toHaveBeenCalledWith(
			b.anna.id,
			"game_won",
			undefined,
			{ tenantId: b.tenant.id },
		);
	});

	test("does not depend on the request's Corps", async () => {
		const a = await corpsWithOpenChallenges("rhenania");
		advanceClock(HOUR);
		testState.tenantId = null;

		expect((await sweepAllChallenges()).ok).toBe(true);
		expect(await statusOf(a.proposed, a.tenant.id)).toBe("settled");
	});

	test("a second run finds nothing to do and writes nothing", async () => {
		const a = await corpsWithOpenChallenges("rhenania");
		const b = await corpsWithOpenChallenges("hassia");
		await pendingCrossChallenge(a.tenant, b.tenant);
		advanceClock(HOUR);
		await sweepAllChallenges();

		const again = await countQueries(() => sweepAllChallenges());

		expect(again.writes).toBe(0);
		expect(again.result).toEqual({
			ok: true,
			corps: expect.arrayContaining([
				{ slug: "rhenania", expired: 0, settled: 0, failed: 0 },
				{ slug: "hassia", expired: 0, settled: 0, failed: 0 },
			]),
			crossExpired: 0,
		});
		for (const corps of [a, b]) {
			expect(await tenantDb(corps.tenant.id).select().from(games)).toHaveLength(
				1,
			);
			expect(await getUserStatsRow(corps.anna.id)).toMatchObject({
				totalGames: 1,
				wins: 1,
			});
		}
	});

	test("overlapping runs settle each result exactly once (#16)", async () => {
		const a = await corpsWithOpenChallenges("rhenania");
		advanceClock(HOUR);

		const runs = await Promise.all([
			sweepAllChallenges(),
			sweepAllChallenges(),
		]);

		const total = (key: "expired" | "settled") =>
			runs
				.flatMap((r) => r.corps)
				.reduce((n, c) => n + (key in c ? (c as CorpsSweep)[key] : 0), 0);
		expect(total("settled")).toBe(1);
		expect(total("expired")).toBe(1);
		expect(await tenantDb(a.tenant.id).select().from(games)).toHaveLength(1);
		expect(await tenantDb(a.tenant.id).select().from(orders)).toHaveLength(1);
		expect((await getUserStatsRow(a.anna.id))?.totalGames).toBe(1);
	});

	test("a Corps whose database fails is reported; the others are still swept", async () => {
		const a = await corpsWithOpenChallenges("rhenania");
		await controlDb().insert(tenants).values({
			id: "gone",
			slug: "gone",
			displayName: "Gone",
			status: "active",
			dbUrl: "file:/nonexistent.db",
		});
		advanceClock(HOUR);
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});

		const report = await sweepAllChallenges();

		expect(report.ok).toBe(false);
		expect(report.corps).toEqual(
			expect.arrayContaining([
				{ slug: "gone", error: expect.stringContaining("gone") },
				{ slug: "rhenania", expired: 1, settled: 1, failed: 0 },
			]),
		);
		expect(logged).toHaveBeenCalledWith(
			expect.stringContaining("challenge sweep failed"),
		);
		expect(await statusOf(a.proposed, a.tenant.id)).toBe("settled");
	});
});

describe("sweepCorpsChallenges", () => {
	test("expires unanswered after 30 min and unplayed after 6 h; settles results after 10 min", async () => {
		const tenant = await createTenant();
		const [anna, bert, carl] = await createPlayers(3);
		const drink = await createDrink();
		const scope = { tenantId: tenant.id, db: tenantDb() };
		signInAs(anna);
		const unanswered = await createChallenge({
			opponentId: bert.id,
			drinkId: drink.id,
			payment: "loser",
		});
		const unplayed = await createChallenge({
			opponentId: carl.id,
			drinkId: drink.id,
			payment: "loser",
		});
		signInAs(carl);
		await respondToChallenge({
			challengeId: unplayed.challengeId as string,
			response: "accept",
		});
		const proposed = await playChallenge({
			challenger: bert,
			opponent: carl,
			drink,
			winner: bert,
		});

		advanceClock(9 * MINUTE);
		expect(await sweepCorpsChallenges(scope)).toEqual({
			expired: 0,
			settled: 0,
			failed: 0,
		});

		advanceClock(2 * MINUTE);
		expect(await sweepCorpsChallenges(scope)).toMatchObject({ settled: 1 });
		expect(await statusOf(proposed.challengeId)).toBe("settled");

		advanceClock(20 * MINUTE);
		expect(await sweepCorpsChallenges(scope)).toMatchObject({ expired: 1 });
		expect(await statusOf(unanswered.challengeId as string)).toBe("expired");
		expect(await statusOf(unplayed.challengeId as string)).toBe("accepted");

		advanceClock(6 * HOUR);
		expect(await sweepCorpsChallenges(scope)).toMatchObject({ expired: 1 });
		expect(await statusOf(unplayed.challengeId as string)).toBe("expired");
	});

	test("a failed settlement is logged and retried by the next run", async () => {
		const tenant = await createTenant();
		const [anna, bert] = await createPlayers(2);
		const drink = await createDrink();
		const scope = { tenantId: tenant.id, db: tenantDb() };
		const { challengeId } = await playChallenge({
			challenger: anna,
			opponent: bert,
			drink,
			winner: anna,
		});
		advanceClock(11 * MINUTE);
		vi.spyOn(tenantDb(), "batch").mockRejectedValueOnce(new Error("timeout"));
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});

		expect(await sweepCorpsChallenges(scope)).toEqual({
			expired: 0,
			settled: 0,
			failed: 1,
		});
		expect(logged).toHaveBeenCalledWith(
			expect.stringContaining("challenge auto-settle failed"),
		);
		expect(await statusOf(challengeId)).toBe("result_proposed");
		expect(await getUserStatsRow(anna.id)).toMatchObject({ totalGames: 0 });

		expect(await sweepCorpsChallenges(scope)).toMatchObject({ settled: 1 });
		expect(await statusOf(challengeId)).toBe("settled");
	});

	test("books the Corps' own markup without a request for that Corps", async () => {
		const tenant = await createTenant({ features: ["drinks.markup"] });
		await setKasseConfig({ markupPercent: 10 });
		const [anna, bert] = await createPlayers(2);
		const drink = await createDrink({ price: 1.5 });
		await playChallenge({
			challenger: anna,
			opponent: bert,
			drink,
			winner: anna,
			payment: "loser",
		});
		advanceClock(11 * MINUTE);
		await createTenant();
		testState.tenantId = null;

		await sweepAllChallenges();

		expect(await tenantDb(tenant.id).select().from(orders)).toEqual([
			expect.objectContaining({
				userId: bert.id,
				pricePerUnit: 1.65,
				costPerUnit: 1.5,
				total: 3.3,
			}),
		]);
	});
});

describe("shown status", () => {
	const at = new Date(START);
	const past = new Date(at.getTime() - 1);
	const row = {
		respondDeadline: at,
		playDeadline: null,
		confirmDeadline: null,
	};

	test("shows rows past their reply or play window as expired", () => {
		for (const shown of [shownChallengeStatus, shownCrossChallengeStatus]) {
			expect(shown({ ...row, status: "pending" }, at)).toBe("pending");
			expect(
				shown({ ...row, status: "pending", respondDeadline: past }, at),
			).toBe("expired");
			expect(shown({ ...row, status: "accepted" }, at)).toBe("accepted");
			expect(
				shown({ ...row, status: "accepted", playDeadline: past }, at),
			).toBe("expired");
			expect(
				shown({ ...row, status: "settled", respondDeadline: past }, at),
			).toBe("settled");
		}
	});

	test("an unconfirmed result is settled in-Corps but expires across Corps", () => {
		const overdue = {
			...row,
			status: "result_proposed",
			confirmDeadline: past,
		};
		expect(shownChallengeStatus(overdue, at)).toBe("result_proposed");
		expect(shownCrossChallengeStatus(overdue, at)).toBe("expired");
		expect(
			shownCrossChallengeStatus({ ...overdue, confirmDeadline: at }, at),
		).toBe("result_proposed");
	});
});
