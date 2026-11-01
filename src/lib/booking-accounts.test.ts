import { describe, expect, test } from "vitest";

import {
	accountKey,
	accountNameProblem,
	MAX_ACCOUNT_NAME_LENGTH,
	normalizeAccountName,
	splitBookingAccounts,
} from "./booking-accounts";

describe("normalizeAccountName", () => {
	test("trims and collapses inner whitespace", () => {
		expect(normalizeAccountName("  Kneipe \t mit  Hassia ")).toBe(
			"Kneipe mit Hassia",
		);
	});
});

describe("accountKey", () => {
	test("is what billing would key the group bill by", () => {
		expect(accountKey("CC Besuch")).toBe(accountKey("cc-besuch"));
		expect(accountKey("CBesuch")).not.toBe(accountKey("CC"));
	});
});

describe("accountNameProblem", () => {
	const existing = ["CC", "CBesuch", "Stiftungsfest"];

	test("a new name is fine", () => {
		expect(accountNameProblem("Kneipe", existing)).toBeNull();
	});

	test.each([
		["", "Namen"],
		["x".repeat(MAX_ACCOUNT_NAME_LENGTH + 1), "höchstens"],
		["Privat", "eigene Kosten"],
		["cbesuch", "„CBesuch“ gibt es schon"],
	])("%s is refused", (name, message) => {
		expect(accountNameProblem(name, existing)).toContain(message);
	});
});

describe("splitBookingAccounts", () => {
	const accounts = [
		{ name: "CC", pinned: true },
		{ name: "AHV", pinned: false },
		{ name: "AKN", pinned: true },
	];

	test("pinned accounts are chips, in order; the rest are behind Weitere", () => {
		expect(splitBookingAccounts(accounts, null)).toEqual({
			chips: ["CC", "AKN"],
			more: ["AHV"],
		});
	});

	test("a selected unpinned account joins the chips", () => {
		expect(splitBookingAccounts(accounts, "AHV").chips).toEqual([
			"CC",
			"AKN",
			"AHV",
		]);
		expect(splitBookingAccounts(accounts, "CC").chips).toEqual(["CC", "AKN"]);
	});
});
