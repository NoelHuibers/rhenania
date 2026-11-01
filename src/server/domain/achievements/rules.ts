// rules.ts — when an achievement moves (#33).
//
// Pure. Every live rule is a function of one snapshot of statistics (Stats)
// that the achievements repo loads in a single batch; the recalculation
// helpers at the end work on the user's whole history the same way. Days
// and hours are Europe/Berlin wall-clock time, whatever the server zone.

import { dayKeyInTZ, getZonedParts } from "~/lib/time";

export type AchievementEvent =
	| "order_created"
	| "game_won"
	| "game_lost"
	| "game_played"
	| "profile_picture_set"
	| "account_created";

export interface OrderEventContext {
	drinkName: string;
	drinkId: string;
	amount: number;
	total: number;
	bookingFor?: string | null;
}

export type FoundingDay = { month: number; day: number };

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

type ZonedParts = ReturnType<typeof getZonedParts>;
export type PlayedGame = { winnerId: string; playedAt: Date };
export type OrderHour = { day: string; hour: number; amount: number };

export type OrderTotals = {
	totalBeers: number;
	distinctDrinks: number;
	radler: number;
	/** Beers booked for a CBesuch (bookingFor contains "CBesuch"). */
	cbesuch: number;
	hell: number;
	pils: number;
	totalSpent: number;
	/** Order rows of the last 60 minutes. */
	ordersLastHour: number;
};

/** Everything a rule may read, loaded once per event. */
export type StatValues = {
	orderTotals: OrderTotals;
	/** Crate size of the ordered drink (null: none, or drink not found). */
	crateSize: number | null;
	/** The user's orders of the last 25 h, which always cover today in Berlin. */
	recentOrders: OrderHour[];
	/** Creation times of the user's latest 200 orders, newest first. */
	latestOrderTimes: Date[];
	/** Distinct UTC hours (hours since the epoch) with at least one order. */
	orderHourBuckets: number[];
	accountCreatedAt: Date | null;
	totalGames: number;
	totalWins: number;
	/** The latest 20 games, own and cross-Corps, newest first. */
	latestGames: PlayedGame[];
	/** Own and cross-Corps games of the last 7 days. */
	gamesLastWeek: PlayedGame[];
};
export type StatKey = keyof StatValues;

export class Stats {
	constructor(private readonly values: Partial<StatValues>) {}

	get<K extends StatKey>(key: K): StatValues[K] {
		if (!(key in this.values)) {
			throw new Error(`Achievement statistic not loaded: ${key}`);
		}
		return this.values[key] as StatValues[K];
	}
}

export type RuleInput = {
	userId: string;
	context?: OrderEventContext;
	now: Date;
	/** `now` on the Berlin wall clock. */
	zoned: ZonedParts;
	/** The Corps' founding day; null when none is stored. */
	foundingDay: FoundingDay | null;
};

export type Rule = {
	/** The rule only applies (and loads nothing) when this holds. */
	when?: (input: RuleInput) => boolean;
	needs?: StatKey[];
	/** New progress value, or null to leave the achievement untouched. */
	value: (stats: Stats, input: RuleInput) => number | null;
};

export function ruleInput(
	userId: string,
	now: Date,
	foundingDay: FoundingDay | null,
	context?: OrderEventContext,
): RuleInput {
	return { userId, context, now, zoned: getZonedParts(now), foundingDay };
}

// ── Pure helpers on the snapshot ───────────────────────────────────────────

/** Own and cross-Corps games merged, newest first. */
export function mergeGames(
	own: PlayedGame[],
	cross: PlayedGame[],
	limit?: number,
): PlayedGame[] {
	const all = [...own, ...cross].sort(
		(a, b) => b.playedAt.getTime() - a.playedAt.getTime(),
	);
	return limit === undefined ? all : all.slice(0, limit);
}

export function toOrderHours(
	rows: Array<{ amount: number; createdAt: Date }>,
): OrderHour[] {
	return rows.map((r) => ({
		day: dayKeyInTZ(r.createdAt),
		hour: getZonedParts(r.createdAt).hour,
		amount: r.amount,
	}));
}

/** Beers ordered today (Berlin day), optionally only in some Berlin hours. */
function beersToday(
	recent: OrderHour[],
	now: Date,
	hourFilter: (hour: number) => boolean = () => true,
): number {
	const today = dayKeyInTZ(now);
	let total = 0;
	for (const r of recent) {
		if (r.day === today && hourFilter(r.hour)) {
			total += r.amount;
		}
	}
	return total;
}

/** Distinct Berlin calendar days among the given epoch hours. */
export function distinctOrderDays(hourBuckets: number[]): number {
	const days = new Set<string>();
	for (const hour of hourBuckets) {
		days.add(dayKeyInTZ(new Date(hour * HOUR_MS)));
	}
	return days.size;
}

/** Consecutive wins, counted from the most recent game. */
export function currentStreak(latest: PlayedGame[], userId: string): number {
	let streak = 0;
	for (const game of latest) {
		if (game.winnerId !== userId) {
			break;
		}
		streak++;
	}
	return streak;
}

/** Shifts a `YYYY-MM-DD` calendar date by whole days (no time zone involved). */
function shiftDayKey(day: string, days: number): string {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function daysBetween(later: string, earlier: string): number {
	return Math.round(
		(Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) /
			DAY_MS,
	);
}

/** Consecutive weekends (Sat/Sun, Berlin time) with at least one order. */
export function consecutiveWeekends(orderTimes: Date[]): number {
	// Normalize each weekend order to its Saturday's Berlin date
	const weekSaturdays = new Set<string>();
	for (const createdAt of orderTimes) {
		const { weekday } = getZonedParts(createdAt); // 0=Sun, 6=Sat
		if (weekday === 0 || weekday === 6) {
			const day = dayKeyInTZ(createdAt);
			weekSaturdays.add(weekday === 6 ? day : shiftDayKey(day, -1));
		}
	}

	const sorted = Array.from(weekSaturdays).sort().reverse();
	if (sorted.length === 0) {
		return 0;
	}

	let streak = 1;
	for (let i = 1; i < sorted.length; i++) {
		// biome-ignore lint/style/noNonNullAssertion: within loop bounds
		if (daysBetween(sorted[i - 1]!, sorted[i]!) === 7) {
			streak++;
		} else {
			break;
		}
	}
	return streak;
}

/** Account age in full days. */
export function accountAgeInDays(createdAt: Date | null, now: Date): number {
	if (!createdAt) {
		return 0;
	}
	return Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS);
}

// ── Rules per event ────────────────────────────────────────────────────────

export const totals = (s: Stats) => s.get("orderTotals");

const beerMilestone: Rule = {
	needs: ["orderTotals"],
	value: (s) => totals(s).totalBeers,
};
const cbesuchSeries: Rule = {
	needs: ["orderTotals"],
	value: (s) => totals(s).cbesuch,
};
const spending: Rule = {
	needs: ["orderTotals"],
	value: (s) => totals(s).totalSpent,
};
const gamesPlayed: Rule = {
	needs: ["totalGames"],
	value: (s) => s.get("totalGames"),
};
const gamesWon: Rule = {
	needs: ["totalWins"],
	value: (s) => s.get("totalWins"),
};
const winningStreak: Rule = {
	needs: ["latestGames"],
	value: (s, { userId }) => currentStreak(s.get("latestGames"), userId),
};
const streakBroken: Rule = { value: () => 0 };
const always1: Rule = { value: () => 1 };

export const isMorning = (hour: number) => hour >= 5 && hour < 8;
export const isMidnight = (hour: number) => hour === 0;
const onDate = (month: number, day: number) => (input: RuleInput) =>
	input.zoned.month === month && input.zoned.day === day;

export const RULES: Record<AchievementEvent, Record<string, Rule>> = {
	order_created: {
		// ── Drinking milestones (total beers ordered) ──────────────────────
		spefuchs: beerMilestone,
		fuchs: beerMilestone,
		cb: beerMilestone,
		iacb: beerMilestone,
		ah: beerMilestone,
		aheb: beerMilestone,

		// ── Drink variety ──────────────────────────────────────────────────
		biertasting: {
			needs: ["orderTotals"],
			value: (s) => totals(s).distinctDrinks,
		},

		// ── Special drinks ─────────────────────────────────────────────────
		kaisersflotte: {
			when: ({ context }) => /sekt/i.test(context?.drinkName ?? ""),
			value: () => 1,
		},
		kisteoderliste: {
			when: ({ context }) => context !== undefined,
			needs: ["crateSize"],
			value: (s, { context }) => {
				const kiste = s.get("crateSize");
				return kiste && (context?.amount ?? 0) >= kiste ? 1 : null;
			},
		},
		alkoholfrei: {
			when: ({ context }) => /alkoholfrei/i.test(context?.drinkName ?? ""),
			needs: ["crateSize"],
			value: (s, { context }) =>
				(context?.amount ?? 0) >= (s.get("crateSize") ?? 20) ? 1 : null,
		},
		radler: { needs: ["orderTotals"], value: (s) => totals(s).radler },

		// ── CBesuch drinking ───────────────────────────────────────────────
		cbesuch: cbesuchSeries,
		cbesuch2: cbesuchSeries,
		cbesuch3: cbesuchSeries,
		cbesuch4: cbesuchSeries,

		// ── Oetti Hell / Pils ratio ────────────────────────────────────────
		// targetValue for both is 10, meaning 10 more of one type than the other
		helleseite: {
			needs: ["orderTotals"],
			value: (s) => totals(s).hell - totals(s).pils,
		},
		dunkleseite: {
			needs: ["orderTotals"],
			value: (s) => totals(s).pils - totals(s).hell,
		},
		// targetValue=100, unlocks when total >= 100 AND neither Hell nor Pils
		// dominates by more than the helleseite/dunkleseite threshold (10)
		avatar: {
			needs: ["orderTotals"],
			value: (s) => {
				const t = totals(s);
				return Math.abs(t.hell - t.pils) < 10 ? t.totalBeers : null;
			},
		},

		// ── Financial ─────────────────────────────────────────────────────
		first_tab: always1,
		big_spender: spending,
		whale: spending,

		// ── Time-based (Europe/Berlin wall clock, whatever the server zone) ─
		// targetValue=1: unlocks once after 4 beers between 05:00–08:00
		fruhaufsteher: {
			when: ({ zoned }) => isMorning(zoned.hour),
			needs: ["recentOrders"],
			value: (s, { now }) =>
				beersToday(s.get("recentOrders"), now, isMorning) >= 4 ? 1 : null,
		},
		// targetValue=10: tracks order count in the last hour
		goldenestunde: {
			needs: ["orderTotals"],
			value: (s) => totals(s).ordersLastHour,
		},
		// targetValue=10: consecutive weekends with at least one order
		wocheende: {
			when: ({ zoned }) => zoned.weekday === 0 || zoned.weekday === 6,
			needs: ["latestOrderTimes"],
			value: (s) => consecutiveWeekends(s.get("latestOrderTimes")),
		},
		// targetValue=365: distinct calendar days with at least one order
		dedication: {
			needs: ["orderHourBuckets"],
			value: (s) => distinctOrderDays(s.get("orderHourBuckets")),
		},

		// ── Date-specific drinking ─────────────────────────────────────────
		// targetValue=1: 4+ beers ordered between 00:00–01:00
		berry: {
			when: ({ zoned }) => isMidnight(zoned.hour),
			needs: ["recentOrders"],
			value: (s, { now }) =>
				beersToday(s.get("recentOrders"), now, isMidnight) >= 4 ? 1 : null,
		},
		// targetValue=1: any order on Jan 1 between 00:00–01:00
		neujahr: {
			when: (input) => onDate(1, 1)(input) && isMidnight(input.zoned.hour),
			value: () => 1,
		},
		// targetValue=10: sum of beers ordered on May 1
		erstermai: {
			when: onDate(5, 1),
			needs: ["recentOrders"],
			value: (s, { now }) => beersToday(s.get("recentOrders"), now),
		},
		// targetValue=10: sum of beers ordered on the Corps' founding day.
		// Never applies when the tenant has not stored one (#36).
		grundungstag: {
			when: (input) =>
				input.foundingDay !== null &&
				onDate(input.foundingDay.month, input.foundingDay.day)(input),
			needs: ["recentOrders"],
			value: (s, { now }) => beersToday(s.get("recentOrders"), now),
		},

		// targetValue=365: account must be at least one year old
		biergeburtstag: {
			needs: ["accountCreatedAt"],
			value: (s, { now }) => accountAgeInDays(s.get("accountCreatedAt"), now),
		},
	},

	game_played: {
		// targetValue=1: play a game on Oct 3 (German Unity Day)
		deutschland: { when: onDate(10, 3), value: () => 1 },
		tierlunge: gamesPlayed,
		jungerfuchs: gamesPlayed,
		jungaktiver: gamesPlayed,
		// targetValue=7: a game on each of 7 distinct days within the last week
		perfektewoche: {
			needs: ["gamesLastWeek"],
			value: (s) =>
				new Set(s.get("gamesLastWeek").map((g) => dayKeyInTZ(g.playedAt))).size,
		},
	},

	game_won: {
		erstersieg: gamesWon,
		champion: gamesWon,
		winning_streak_3: winningStreak,
		winning_streak_5: winningStreak,
		winning_streak_10: winningStreak,
	},

	game_lost: {
		winning_streak_3: streakBroken,
		winning_streak_5: streakBroken,
		winning_streak_10: streakBroken,
	},

	account_created: { willkommen: always1 },
	profile_picture_set: { bild: always1 },
};

// ── Recalculation from the whole history ───────────────────────────────────

/** Statistics the recalculation shares with live tracking. */
export const RECALC_STATS: StatKey[] = [
	"orderTotals",
	"latestOrderTimes",
	"orderHourBuckets",
	"accountCreatedAt",
	"totalGames",
	"totalWins",
	"latestGames",
];

/** 1 if any order reached its crate size (20 without one), else 0. */
export function anyFullCrate(
	rows: Array<{ amount: number; kastengroesse: number | null }>,
): number {
	for (const order of rows) {
		const kiste = order.kastengroesse ?? 20;
		if (order.amount >= kiste) {
			return 1;
		}
	}
	return 0;
}

/** Most beers ordered within one Berlin day in the given Berlin hours. */
export function bestBeerDayInHours(
	orders: OrderHour[],
	hourFilter: (hour: number) => boolean,
): number {
	const dayMap = new Map<string, number>();
	for (const order of orders) {
		if (hourFilter(order.hour)) {
			dayMap.set(order.day, (dayMap.get(order.day) ?? 0) + order.amount);
		}
	}
	return dayMap.size === 0 ? 0 : Math.max(...dayMap.values());
}

/** 1 if any order fell between 00:00 and 01:00 on a January 1st, else 0. */
export function orderedOnNewYear(orders: OrderHour[]): number {
	for (const order of orders) {
		if (order.day.endsWith("-01-01") && order.hour === 0) {
			return 1;
		}
	}
	return 0;
}

/** Most beers ordered on a Berlin calendar date (month 1-12) in any one year. */
export function maxBeersOnCalendarDate(
	orders: OrderHour[],
	month: number,
	day: number,
): number {
	const suffix = `-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
	const yearMap = new Map<string, number>();
	for (const order of orders) {
		if (order.day.endsWith(suffix)) {
			const year = order.day.slice(0, 4);
			yearMap.set(year, (yearMap.get(year) ?? 0) + order.amount);
		}
	}
	return yearMap.size === 0 ? 0 : Math.max(...yearMap.values());
}

/** 1 if any game fell on October 3rd (Berlin), else 0. */
export function playedOnOct3(games: PlayedGame[]): number {
	for (const game of games) {
		if (dayKeyInTZ(game.playedAt).endsWith("-10-03")) {
			return 1;
		}
	}
	return 0;
}

/** Most distinct Berlin game days within any 7-day window. */
export function bestWeeklyGameStreak(games: PlayedGame[]): number {
	if (games.length === 0) {
		return 0;
	}

	const days = [...new Set(games.map((g) => dayKeyInTZ(g.playedAt)))].sort();

	let best = 0;
	for (const from of days) {
		const count = days.filter((d) => {
			const offset = daysBetween(d, from);
			return offset >= 0 && offset < 7;
		}).length;
		best = Math.max(best, count);
	}
	return best;
}
