import { describe, expect, test } from "vitest";

import { ELO_OPT_OUT, isEloOptOut } from "./elo-preference";

describe("isEloOptOut (#244)", () => {
	test("only the stored false opts out", () => {
		expect(ELO_OPT_OUT).toBe("false");
		expect(isEloOptOut("false")).toBe(true);
	});

	test("no row or any other value takes part, as the SQL filters do", () => {
		for (const value of [
			undefined,
			null,
			"true",
			'"false"',
			" false",
			"0",
			"{",
		]) {
			expect(isEloOptOut(value)).toBe(false);
		}
	});
});
