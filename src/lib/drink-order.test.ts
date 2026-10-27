import { describe, expect, test } from "vitest";

import {
	BOOKING_ACCOUNTS,
	COMMON_BOOKING_ACCOUNTS,
	clampOrderAmount,
	confirmLabel,
	createOrderGate,
	GHOST_TAP_MS,
	MAX_ORDER_AMOUNT,
	orderToastMessage,
	quantityPresets,
	splitMenu,
	withRecentDrink,
} from "./drink-order";

describe("booking accounts", () => {
	test("the chips are a subset of the fixed list", () => {
		expect(BOOKING_ACCOUNTS).toContain("CC");
		expect(BOOKING_ACCOUNTS).toContain("AKN");
		for (const a of COMMON_BOOKING_ACCOUNTS) {
			expect(BOOKING_ACCOUNTS).toContain(a);
		}
	});
});

describe("clampOrderAmount", () => {
	test.each([
		[1, 1],
		[3, 3],
		[0, 1],
		[-5, 1],
		[2.7, 2],
		[100, 100],
		[101, MAX_ORDER_AMOUNT],
		[Number.NaN, 1],
		[Number.POSITIVE_INFINITY, 1],
	])("%s → %s", (input, expected) => {
		expect(clampOrderAmount(input)).toBe(expected);
	});
});

describe("quantityPresets", () => {
	test("1, 2 and the drink's Kasten", () => {
		expect(quantityPresets(24)).toEqual([
			{ amount: 1, label: "1" },
			{ amount: 2, label: "2" },
			{ amount: 24, label: "Kasten (24)" },
		]);
	});

	test("a Kasten of 20 when the drink has none", () => {
		expect(quantityPresets(null).at(-1)).toEqual({
			amount: 20,
			label: "Kasten (20)",
		});
		expect(quantityPresets(undefined).at(-1)?.amount).toBe(20);
	});

	test("no Kasten chip that duplicates 1 or 2, and never above the limit", () => {
		expect(quantityPresets(2).map((p) => p.amount)).toEqual([1, 2]);
		expect(quantityPresets(500).at(-1)?.amount).toBe(MAX_ORDER_AMOUNT);
	});
});

describe("labels", () => {
	test("the confirm button says what it books and the total", () => {
		expect(confirmLabel(null, 1.2)).toMatch(/^Bestellen · 1,20\s€$/);
		expect(confirmLabel("AKN", 3)).toMatch(/^Auf AKN buchen · 3,00\s€$/);
	});

	test("the success toast keeps its wording", () => {
		expect(orderToastMessage(1, "Pils", 1.2, null)).toMatch(
			/^1x Pils bestellt \(1,20\s€\) - Abrechnung auf eigene Kosten$/,
		);
		expect(orderToastMessage(2, "Pils", 2.4, "CC")).toMatch(
			/^2x Pils bestellt \(2,40\s€\) - Abrechnung auf CC$/,
		);
	});
});

describe("splitMenu", () => {
	const drink = (id: string, isCurrentlyAvailable = true) => ({
		id,
		isCurrentlyAvailable,
	});
	const menu = [
		drink("pils"),
		drink("weizen"),
		drink("radler", false),
		drink("spezi"),
		drink("wasser"),
		drink("cola"),
	];

	test("keeps menu order for available and unavailable drinks", () => {
		const { available, unavailable } = splitMenu(menu, []);
		expect(available.map((d) => d.id)).toEqual([
			"pils",
			"weizen",
			"spezi",
			"wasser",
			"cola",
		]);
		expect(unavailable.map((d) => d.id)).toEqual(["radler"]);
	});

	test("shortcuts follow the member's order, skip gone or unavailable drinks, max 4", () => {
		const { recent } = splitMenu(menu, [
			"wasser",
			"radler",
			"deleted",
			"pils",
			"pils",
			"cola",
			"spezi",
			"weizen",
		]);
		expect(recent.map((d) => d.id)).toEqual([
			"wasser",
			"pils",
			"cola",
			"spezi",
		]);
	});
});

describe("withRecentDrink", () => {
	test("a new drink goes first, the list stays at 4", () => {
		expect(withRecentDrink(["a", "b", "c", "d"], "e")).toEqual([
			"e",
			"a",
			"b",
			"c",
		]);
	});

	test("a shortcut that is already there keeps its place", () => {
		const ids = ["a", "b"];
		const next = withRecentDrink(ids, "b");
		expect(next).toEqual(["a", "b"]);
		expect(next).not.toBe(ids);
	});
});

describe("createOrderGate (double-tap guard)", () => {
	function clock() {
		let t = 1_000;
		return {
			now: () => t,
			advance: (ms: number) => {
				t += ms;
			},
		};
	}

	test("a double tap on the confirm button books once", () => {
		const c = clock();
		const gate = createOrderGate({ now: c.now });
		const key = gate.open();
		expect(key).not.toBeNull();
		expect(gate.claim(key)).toBe(true);
		expect(gate.claim(key)).toBe(false);
		c.advance(5);
		expect(gate.claim(key)).toBe(false);
	});

	test("the tap right after a confirm does not reopen the drawer", () => {
		const c = clock();
		const gate = createOrderGate({ now: c.now });
		gate.claim(gate.open());
		c.advance(GHOST_TAP_MS - 1);
		expect(gate.open()).toBeNull();
		c.advance(1);
		const next = gate.open();
		expect(next).not.toBeNull();
		expect(gate.claim(next)).toBe(true);
	});

	test("ordering again needs a new drawer with a new key", () => {
		const c = clock();
		const gate = createOrderGate({ now: c.now });
		const first = gate.open();
		gate.claim(first);
		c.advance(GHOST_TAP_MS);
		const second = gate.open();
		expect(second).not.toBe(first);
		expect(gate.claim(first)).toBe(false);
		expect(gate.claim(second)).toBe(true);
	});

	test("a cancelled or replaced drawer cannot book", () => {
		const gate = createOrderGate({ now: () => 0 });
		const cancelled = gate.open();
		gate.cancel(cancelled);
		expect(gate.claim(cancelled)).toBe(false);

		const stale = gate.open();
		const current = gate.open();
		expect(gate.claim(stale)).toBe(false);
		gate.cancel(stale); // closing an old drawer leaves the open one alone
		expect(gate.claim(current)).toBe(true);
	});

	test("no key, no booking", () => {
		const gate = createOrderGate();
		gate.open();
		expect(gate.claim(null)).toBe(false);
		gate.cancel(null);
	});
});
