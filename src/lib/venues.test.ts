import { describe, expect, test } from "vitest";

import { defaultVenueName } from "./venues";

describe("defaultVenueName (#36)", () => {
	test("is the venue created first, or empty", () => {
		expect(defaultVenueName([])).toBe("");
		expect(
			defaultVenueName([
				{ shortName: "Altes Haus", createdAt: new Date("2026-02-01") },
				{ shortName: "Corpshaus", createdAt: new Date("2026-01-01") },
				{ shortName: "Kneipe", createdAt: new Date("2026-03-01") },
			]),
		).toBe("Corpshaus");
	});
});
