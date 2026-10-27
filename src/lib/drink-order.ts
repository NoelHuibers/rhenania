// drink-order.ts — the rules behind the two-tap order on /trinken (#74):
// which accounts a drink can be booked on, the quantity limits, what the
// confirm button and the toast say, which drinks show up as shortcuts, and
// the guard that keeps a double tap from booking twice.
//
// Pure, so the flow can be tested without a browser.

import { formatEUR } from "./format";

/** Group accounts a drink can be booked on; null books on the member. */
export const BOOKING_ACCOUNTS = [
	"CC",
	"AKN",
	"CBesuch",
	"AHV",
	"RC",
	"SC",
	"Stiftungsfest",
	"Nikolausbowle",
] as const;

export type BookingAccount = (typeof BOOKING_ACCOUNTS)[number];

/** The accounts shown as chips; the rest sit behind "Weitere". */
export const COMMON_BOOKING_ACCOUNTS: readonly BookingAccount[] = [
	"CC",
	"AKN",
	"CBesuch",
];

export const MIN_ORDER_AMOUNT = 1;
export const MAX_ORDER_AMOUNT = 100;

/** Default Kasten size when a drink has none stored. */
export const DEFAULT_KASTEN = 20;

/** A whole amount within the order limits; anything unusable becomes 1. */
export function clampOrderAmount(value: number): number {
	if (!Number.isFinite(value)) {
		return MIN_ORDER_AMOUNT;
	}
	return Math.min(
		MAX_ORDER_AMOUNT,
		Math.max(MIN_ORDER_AMOUNT, Math.trunc(value)),
	);
}

export type QuantityPreset = { amount: number; label: string };

/** The preset chips in the order drawer: 1, 2 and a Kasten. */
export function quantityPresets(
	kastengroesse: number | null | undefined,
): QuantityPreset[] {
	const kasten = clampOrderAmount(kastengroesse ?? DEFAULT_KASTEN);
	const presets: QuantityPreset[] = [
		{ amount: 1, label: "1" },
		{ amount: 2, label: "2" },
	];
	if (kasten > 2) {
		presets.push({ amount: kasten, label: `Kasten (${kasten})` });
	}
	return presets;
}

/** "Bestellen · 1,20 €" or, on a group account, "Auf AKN buchen · 3,00 €". */
export function confirmLabel(
	billing: BookingAccount | null,
	total: number,
): string {
	const action = billing ? `Auf ${billing} buchen` : "Bestellen";
	return `${action} · ${formatEUR(total)}`;
}

/** The success toast, unchanged since before #74 (E2E and members rely on it). */
export function orderToastMessage(
	quantity: number,
	drinkName: string,
	total: number,
	billing: BookingAccount | null,
): string {
	return `${quantity}x ${drinkName} bestellt (${formatEUR(total)}) - Abrechnung auf ${
		billing ? billing : "eigene Kosten"
	}`;
}

/** How many shortcuts the "Zuletzt bestellt" row shows. */
export const RECENT_DRINKS_LIMIT = 4;

type MenuDrink = { id: string; isCurrentlyAvailable: boolean };

export type MenuSections<T extends MenuDrink> = {
	/** Shortcuts: recently ordered drinks that can be ordered right now. */
	recent: T[];
	available: T[];
	unavailable: T[];
};

/**
 * Splits the menu for display. `recentIds` is the member's order (most
 * ordered first); ids of drinks that are gone or unavailable are skipped.
 */
export function splitMenu<T extends MenuDrink>(
	drinks: T[],
	recentIds: readonly string[],
): MenuSections<T> {
	const available = drinks.filter((d) => d.isCurrentlyAvailable);
	const unavailable = drinks.filter((d) => !d.isCurrentlyAvailable);
	const byId = new Map(available.map((d) => [d.id, d]));
	const recent: T[] = [];
	for (const id of recentIds) {
		const drink = byId.get(id);
		if (drink && !recent.includes(drink)) {
			recent.push(drink);
		}
		if (recent.length === RECENT_DRINKS_LIMIT) {
			break;
		}
	}
	return { recent, available, unavailable };
}

/**
 * The shortcut list after ordering `drinkId`: a drink that is already a
 * shortcut keeps its place, a new one goes first.
 */
export function withRecentDrink(
	recentIds: readonly string[],
	drinkId: string,
): string[] {
	if (recentIds.includes(drinkId)) {
		return [...recentIds];
	}
	return [drinkId, ...recentIds].slice(0, RECENT_DRINKS_LIMIT);
}

/** How long after a confirm a tap on the menu is taken as the second half of a double tap. */
export const GHOST_TAP_MS = 400;

export type OrderGate = {
	/** Starts an order (the drawer opens). Null right after a confirm. */
	open(): number | null;
	/** True exactly once per opened order: the confirm may book. */
	claim(key: number | null): boolean;
	/** The drawer was closed without ordering. */
	cancel(key: number | null): void;
};

/**
 * One booking per opened drawer. The confirm button only books if it can
 * claim the drawer's key, and each key can be claimed once, so a double
 * tap or a re-render can never book twice; ordering again needs a new
 * tap on the drink. Taps that land on the menu right after a confirm (the
 * second tap of a double tap, once the drawer is gone) do not reopen it.
 */
export function createOrderGate(
	options: { now?: () => number; ghostTapMs?: number } = {},
): OrderGate {
	const now = options.now ?? Date.now;
	const ghostTapMs = options.ghostTapMs ?? GHOST_TAP_MS;
	let seq = 0;
	let current: number | null = null;
	let lastClaimAt = Number.NEGATIVE_INFINITY;

	return {
		open() {
			if (now() - lastClaimAt < ghostTapMs) {
				return null;
			}
			seq += 1;
			current = seq;
			return current;
		},
		claim(key) {
			if (key === null || key !== current) {
				return false;
			}
			current = null;
			lastClaimAt = now();
			return true;
		},
		cancel(key) {
			if (key !== null && key === current) {
				current = null;
			}
		},
	};
}
