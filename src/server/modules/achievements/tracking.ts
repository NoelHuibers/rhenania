// tracking.ts — achievement tracking: the events that move achievements,
// and the recalculation from a user's whole history (#33).
//
// Every function takes the TenantScope of the Corps whose achievements it
// moves. A player of a cross-Corps game is tracked in the Corps they played
// for, so the caller passes that Corps' scope. The rules are pure
// (domain/achievements/rules); the queries are in ./repo.

import "server-only";

import {
	type AchievementEvent,
	accountAgeInDays,
	anyFullCrate,
	bestBeerDayInHours,
	bestWeeklyGameStreak,
	consecutiveWeekends,
	currentStreak,
	distinctOrderDays,
	isMidnight,
	isMorning,
	maxBeersOnCalendarDate,
	type OrderEventContext,
	orderedOnNewYear,
	playedOnOct3,
	RECALC_STATS,
	RULES,
	type RuleInput,
	ruleInput,
	type Stats,
	totals,
} from "~/server/domain/achievements/rules";
import type { TenantScope } from "~/server/lib/tenant-scope";
import * as repo from "./repo";
import { foundingDayOf } from "./service";

export type {
	AchievementEvent,
	OrderEventContext,
} from "~/server/domain/achievements/rules";

// ── Tracking ───────────────────────────────────────────────────────────────

/**
 * Moves the user's achievements for `event` in `tenant`'s Corps. Never
 * throws: a failure is logged, so tracking never breaks the calling action.
 */
export async function checkAndUnlockAchievements(
	tenant: TenantScope,
	userId: string,
	event: AchievementEvent,
	context?: OrderEventContext,
): Promise<void> {
	try {
		const rules = RULES[event];
		const foundingDay = await foundingDayOf(tenant);
		const input = ruleInput(userId, tenant.now(), foundingDay, context);

		// Unlocked achievements are no longer tracked.
		const pending = (
			await repo.loadCatalogue(tenant.db, userId, Object.keys(rules))
		).flatMap((achievement) => {
			const rule = rules[achievement.key];
			if (!rule || achievement.unlocked || (rule.when && !rule.when(input))) {
				return [];
			}
			return [{ achievement, rule }];
		});
		if (pending.length === 0) {
			return;
		}

		const stats = await repo.loadStats(
			tenant,
			userId,
			pending.flatMap(({ rule }) => rule.needs ?? []),
			input,
		);
		const outcomes: repo.Outcome[] = [];
		for (const { achievement, rule } of pending) {
			const value = rule.value(stats, input);
			if (value !== null) {
				outcomes.push({ achievement, value });
			}
		}
		await repo.saveOutcomes(tenant.db, userId, outcomes, tenant.now());
	} catch (error) {
		console.error("Achievement tracking error:", error);
		// Never throw — achievement tracking must not break the calling action
	}
}

// ── Recalculation from the whole history (seed) ────────────────────────────

async function recalculatedValue(
	tenant: TenantScope,
	userId: string,
	key: string,
	stats: Stats,
	input: RuleInput,
): Promise<number | null> {
	const { db } = tenant;
	switch (key) {
		case "spefuchs":
		case "fuchs":
		case "cb":
		case "iacb":
		case "ah":
		case "aheb":
			return totals(stats).totalBeers;
		case "biertasting":
			return totals(stats).distinctDrinks;
		case "kaisersflotte":
			return (await repo.sektOrderCount(db, userId)) > 0 ? 1 : 0;
		case "kisteoderliste":
			return anyFullCrate(await repo.crateOrders(db, userId));
		case "alkoholfrei":
			return anyFullCrate(await repo.crateOrders(db, userId, "alkoholfrei"));
		case "radler":
			return totals(stats).radler;
		case "cbesuch":
		case "cbesuch2":
		case "cbesuch3":
		case "cbesuch4":
			return totals(stats).cbesuch;
		case "helleseite":
			return totals(stats).hell - totals(stats).pils;
		case "dunkleseite":
			return totals(stats).pils - totals(stats).hell;
		case "avatar": {
			const t = totals(stats);
			return Math.abs(t.hell - t.pils) < 10 ? t.totalBeers : 0;
		}
		case "first_tab":
			return totals(stats).totalBeers > 0 ? 1 : 0;
		case "big_spender":
		case "whale":
			return totals(stats).totalSpent;
		case "fruhaufsteher":
			return bestBeerDayInHours(await repo.orderHours(db, userId), isMorning) >=
				4
				? 1
				: 0;
		case "goldenestunde":
			return totals(stats).ordersLastHour;
		case "wocheende":
			return consecutiveWeekends(stats.get("latestOrderTimes"));
		case "dedication":
			return distinctOrderDays(stats.get("orderHourBuckets"));
		case "berry":
			return bestBeerDayInHours(
				await repo.orderHours(db, userId),
				isMidnight,
			) >= 4
				? 1
				: 0;
		case "neujahr":
			return orderedOnNewYear(await repo.orderHours(db, userId));
		case "erstermai":
			return maxBeersOnCalendarDate(await repo.orderHours(db, userId), 5, 1);
		case "grundungstag":
			return input.foundingDay
				? maxBeersOnCalendarDate(
						await repo.orderHours(db, userId),
						input.foundingDay.month,
						input.foundingDay.day,
					)
				: null;
		case "deutschland":
			return playedOnOct3(await repo.playedGames(tenant, userId));
		case "tierlunge":
		case "jungerfuchs":
		case "jungaktiver":
			return stats.get("totalGames");
		case "erstersieg":
		case "champion":
			return stats.get("totalWins");
		case "perfektewoche":
			return bestWeeklyGameStreak(await repo.playedGames(tenant, userId));
		case "winning_streak_3":
		case "winning_streak_5":
		case "winning_streak_10":
			return currentStreak(stats.get("latestGames"), userId);
		case "willkommen":
			return 1;
		case "bild":
			return (await repo.userImage(db, userId)) ? 1 : 0;
		case "biergeburtstag":
			return accountAgeInDays(stats.get("accountCreatedAt"), input.now);
		default:
			return null;
	}
}

/** Rebuilds the user's progress and unlocks in `tenant` from their history. */
export async function recalculateAllAchievements(
	tenant: TenantScope,
	userId: string,
): Promise<void> {
	const foundingDay = await foundingDayOf(tenant);
	const input = ruleInput(userId, tenant.now(), foundingDay);
	const [catalogue, stats] = await Promise.all([
		repo.loadCatalogue(tenant.db, userId),
		repo.loadStats(tenant, userId, RECALC_STATS, input),
	]);

	const outcomes: repo.Outcome[] = [];
	for (const achievement of catalogue) {
		const value = await recalculatedValue(
			tenant,
			userId,
			achievement.key,
			stats,
			input,
		);
		if (value !== null) {
			outcomes.push({ achievement, value });
		}
	}
	await repo.saveOutcomes(tenant.db, userId, outcomes, tenant.now());
}
